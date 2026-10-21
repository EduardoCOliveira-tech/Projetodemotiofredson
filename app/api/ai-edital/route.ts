// app/api/ai-edital/route.ts
// Recebe o PDF do Edital / Planilha Base via FormData e devolve o JSON
// estruturado do esboço do orçamento (validado pelo Schema Zod).

import { NextResponse } from "next/server"
import { GoogleGenAI, createPartFromBase64, createPartFromUri } from "@google/genai"
import { AiEditalResponseSchema } from "@/lib/proposal-types"
import { zodToGeminiSchema } from "@/lib/zod-to-gemini"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const LIMITE_INLINE = 18 * 1024 * 1024    // acima disso usa a Files API
const LIMITE_MAXIMO = 50 * 1024 * 1024

const responseSchema = zodToGeminiSchema(AiEditalResponseSchema)

const PROMPT = `Você é um engenheiro orçamentista especialista em licitações de obras públicas no Brasil
(Lei 14.133/2021, Decreto 7.983/2013, Acórdão 2.622/2013-TCU).

Analise o PDF anexado (edital, termo de referência e/ou planilha orçamentária base) e extraia:

1. "metadados":
   - órgão licitante, número do edital/processo, objeto, município/UF;
   - prazo de execução em MESES (converta dias corridos ÷ 30, arredondando para cima); null se ausente;
   - BDI de referência do edital em % (ex.: 24.18). Se houver BDI diferenciado, use o BDI de serviços; null se ausente;
   - regimeDesonerado: true se a planilha indicar "desonerado"/"com desoneração"; false caso contrário;
   - bancoSugerido: banco de preços predominante (SINAPI ou GOINFRA), UF de referência e data-base no formato YYYY-MM.

2. "itensExtraidos": TODOS os itens de serviço da planilha orçamentária, na ordem original.
   - NÃO inclua linhas de título/subtotal de etapa como itens; use o título como "etapaSugerida" dos itens filhos.
   - codigoReferencia: somente o código (ex.: "87878", "92915"); sem "SINAPI", hífens de prefixo ou espaços.
   - fonte: "SINAPI", "GOINFRA" ou "PROPRIA" (composição própria, cotação, ORSE, SICRO etc. => "PROPRIA").
   - quantidade e precoUnitarioEdital como números decimais (converta "1.234,56" para 1234.56).
   - precoUnitarioEdital deve ser o preço unitário COM BDI quando a planilha apresentar as duas colunas.

3. "resumoExigenciasTecnicas": exigências de qualificação técnica (atestados de capacidade técnico-operacional
   e técnico-profissional, parcelas de maior relevância com quantitativos mínimos, CAT, visita técnica,
   registro no CREA/CAU etc.), cada uma como frase objetiva e curta.

Regras: não invente dados. Se um campo textual não existir, retorne string vazia. Responda apenas com o JSON.`

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY não configurada no servidor." }, { status: 500 })
  }

  let arquivoRemoto: string | undefined
  const ai = new GoogleGenAI({ apiKey })

  try {
    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie o PDF no campo 'file' do FormData." }, { status: 400 })
    }
    const ehPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!ehPdf) return NextResponse.json({ error: "O arquivo deve ser um PDF." }, { status: 415 })
    if (file.size > LIMITE_MAXIMO) {
      return NextResponse.json({ error: "PDF excede o limite de 50 MB." }, { status: 413 })
    }

    // PDFs pequenos vão inline (base64); grandes usam a Files API.
    let pdfPart
    if (file.size <= LIMITE_INLINE) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64")
      pdfPart = createPartFromBase64(base64, "application/pdf")
    } else {
      const enviado = await ai.files.upload({ file, config: { mimeType: "application/pdf", displayName: file.name } })
      arquivoRemoto = enviado.name
      // Aguarda o processamento do arquivo
      let info = enviado
      for (let i = 0; i < 30 && info.state === "PROCESSING"; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        info = await ai.files.get({ name: enviado.name! })
      }
      if (info.state === "FAILED" || !info.uri) throw new Error("Falha ao processar o PDF na Files API.")
      pdfPart = createPartFromUri(info.uri, "application/pdf")
    }

    const resposta = await ai.models.generateContent({
      model: MODELO,
      contents: [{ role: "user", parts: [pdfPart, { text: PROMPT }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0,
        maxOutputTokens: 65536,
      },
    })

    const texto = resposta.text
    if (!texto) {
      const motivo = resposta.candidates?.[0]?.finishReason ?? "desconhecido"
      return NextResponse.json({ error: `A IA não retornou conteúdo (motivo: ${motivo}).` }, { status: 502 })
    }

    let bruto: unknown
    try {
      bruto = JSON.parse(texto)
    } catch {
      return NextResponse.json(
        { error: "Resposta da IA não é um JSON válido (possível truncamento em planilhas muito extensas)." },
        { status: 502 },
      )
    }

    const validado = AiEditalResponseSchema.safeParse(bruto)
    if (!validado.success) {
      return NextResponse.json(
        { error: "JSON da IA fora do schema esperado.", issues: validado.error.issues.slice(0, 20) },
        { status: 422 },
      )
    }

    return NextResponse.json({
      data: validado.data,
      meta: { modelo: MODELO, arquivo: file.name, tokens: resposta.usageMetadata?.totalTokenCount ?? null },
    })
  } catch (error: any) {
    console.error("[ai-edital] erro:", error)
    return NextResponse.json({ error: "Erro ao analisar o edital.", details: error?.message }, { status: 500 })
  } finally {
    if (arquivoRemoto) ai.files.delete({ name: arquivoRemoto }).catch(() => {})
  }
}

