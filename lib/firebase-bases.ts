// lib/firebase-bases.ts
// Gestão e versionamento de bases SINAPI/GOINFRA no Firestore.
//
// Coleções:
//   sistema_config/parametros_gerais            -> bases padrão ativas
//   catalogo_bases/{base_id}                    -> metadados da planilha mensal
//   bases_oficiais/{base_id}/insumos/{codigo}
//   bases_oficiais/{base_id}/composicoes/{codigo}

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import * as XLSX from "xlsx"
import { getDb } from "./firebase"
import type {
  AiEditalResponse,
  BaseReferencia,
  CatalogoBase,
  ComposicaoCPU,
  FonteBase,
  InsumoBase,
  OrcamentoLicita,
  ParametrosGerais,
  TipoInsumo,
} from "./proposal-types"
import { chaveEntidade } from "./proposal-types"
import {
  codigosParaHidratacao,
  migrarBaseOrcamento,
  montarOrcamentoDeEdital,
  type ResultadoMigracao,
} from "./budget-engine"

export const TAMANHO_CHUNK = 450
const LIMITE_IN = 30 // limite do operador `in` do Firestore

/* ============================================================================
 * Utilidades
 * ========================================================================== */

/** IDs de documento não podem conter "/". */
export const docIdDeCodigo = (codigo: string) => String(codigo).trim().replace(/\//g, "_")
const codigoDeChave = (chave: string) => chave.slice(chave.indexOf(":") + 1)
const fonteDeChave = (chave: string) => chave.slice(0, chave.indexOf(":")) as FonteBase

export const montarBaseId = (orgao: FonteBase, uf: string, mesAno: string) =>
  `${orgao}-${uf.toUpperCase()}-${mesAno}`

export const baseVazia = (baseId: string | null = null): BaseReferencia => ({ base_id: baseId, insumos: {}, composicoes: {} })

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/* ============================================================================
 * Catálogo e parâmetros
 * ========================================================================== */

export async function listarCatalogoBases(): Promise<CatalogoBase[]> {
  const snap = await getDocs(collection(getDb(), "catalogo_bases"))
  return snap.docs
    .map((d) => ({ ...(d.data() as CatalogoBase), id: d.id }))
    .sort((a, b) => (b.mes_ano || "").localeCompare(a.mes_ano || "") || a.id.localeCompare(b.id))
}

export async function obterParametrosGerais(): Promise<ParametrosGerais> {
  const snap = await getDoc(doc(getDb(), "sistema_config", "parametros_gerais"))
  return (snap.data() as ParametrosGerais) ?? {}
}

export async function definirBasePadrao(orgao: FonteBase, baseId: string) {
  const campo = orgao === "SINAPI" ? "base_padrao_sinapi" : "base_padrao_goinfra"
  await setDoc(doc(getDb(), "sistema_config", "parametros_gerais"), { [campo]: baseId }, { merge: true })
}

/* ============================================================================
 * Leitura (hidratação) — busca recursiva das CPUs e insumos
 * ========================================================================== */

function insumoDeDoc(fonte: FonteBase, id: string, data: any): InsumoBase {
  return {
    id: chaveEntidade(fonte, data.codigo ?? id),
    codigo: String(data.codigo ?? id),
    fonte,
    descricao: data.descricao ?? "",
    unidade: data.unidade ?? "",
    preco_base: Number(data.preco_base ?? data.preco_base_desonerado ?? 0),
    preco_base_desonerado: data.preco_base_desonerado != null ? Number(data.preco_base_desonerado) : undefined,
    tipo: (data.tipo as TipoInsumo) ?? "Material",
  }
}

function composicaoDeDoc(fonte: FonteBase, id: string, data: any): ComposicaoCPU {
  return {
    id: chaveEntidade(fonte, data.codigo ?? id),
    codigo: String(data.codigo ?? id),
    fonte,
    descricao: data.descricao ?? "",
    unidade: data.unidade ?? "",
    insumos: Array.isArray(data.insumos) ? data.insumos : [],
    composicoes_auxiliares: Array.isArray(data.composicoes_auxiliares) ? data.composicoes_auxiliares : [],
    custo_referencia: data.custo_referencia ?? undefined,
    custo_referencia_desonerado: data.custo_referencia_desonerado ?? undefined,
  }
}

async function buscarDocs(baseId: string, colecao: "insumos" | "composicoes", codigos: string[]) {
  const db = getDb()
  const ref = collection(db, "bases_oficiais", baseId, colecao)
  const ids = Array.from(new Set(codigos.map(docIdDeCodigo))).filter(Boolean)
  const resultados = await Promise.all(
    chunk(ids, LIMITE_IN).map((grupo) => getDocs(query(ref, where(documentId(), "in", grupo)))),
  )
  return resultados.flatMap((s) => s.docs.map((d) => ({ id: d.id, data: d.data() })))
}

/**
 * Carrega da base `baseId` as composições/insumos dos códigos informados e,
 * recursivamente, todas as dependências (composições auxiliares e insumos).
 */
export async function carregarBaseReferencia(
  baseId: string,
  codigos: Array<{ fonte: FonteBase; codigo: string }>,
): Promise<BaseReferencia> {
  const meta = await getDoc(doc(getDb(), "catalogo_bases", baseId))
  const fonte: FonteBase = (meta.data()?.orgao as FonteBase) ?? (baseId.startsWith("GOINFRA") ? "GOINFRA" : "SINAPI")
  const base = baseVazia(baseId)

  // Somente códigos da mesma fonte da base são resolvidos nela
  let pendentesComp = codigos.filter((c) => c.fonte === fonte).map((c) => c.codigo)
  let pendentesIns: string[] = []
  const visitados = new Set<string>()

  for (let profundidade = 0; profundidade < 12 && (pendentesComp.length || pendentesIns.length); profundidade++) {
    const comps = pendentesComp.filter((c) => !visitados.has(`C:${c}`))
    comps.forEach((c) => visitados.add(`C:${c}`))
    const docsComp = comps.length ? await buscarDocs(baseId, "composicoes", comps) : []
    const encontrados = new Set<string>()
    const proxComp: string[] = []
    const proxIns: string[] = [...pendentesIns]

    for (const d of docsComp) {
      const c = composicaoDeDoc(fonte, d.id, d.data)
      base.composicoes[c.id] = c
      encontrados.add(docIdDeCodigo(c.codigo))
      c.composicoes_auxiliares.forEach((a) => {
        if (!base.composicoes[a.id_composicao]) proxComp.push(codigoDeChave(a.id_composicao))
      })
      c.insumos.forEach((i) => {
        if (fonteDeChave(i.id_insumo) === fonte && !base.insumos[i.id_insumo]) proxIns.push(codigoDeChave(i.id_insumo))
      })
    }
    // Códigos de serviço que não são composição podem ser insumos diretos
    if (profundidade === 0) comps.filter((c) => !encontrados.has(docIdDeCodigo(c))).forEach((c) => proxIns.push(c))

    const ins = proxIns.filter((c) => !visitados.has(`I:${c}`))
    ins.forEach((c) => visitados.add(`I:${c}`))
    const docsIns = ins.length ? await buscarDocs(baseId, "insumos", ins) : []
    for (const d of docsIns) {
      const i = insumoDeDoc(fonte, d.id, d.data)
      base.insumos[i.id] = i
    }

    pendentesComp = proxComp
    pendentesIns = []
  }
  return base
}

export function codigosDoOrcamento(orc: OrcamentoLicita): Array<{ fonte: FonteBase; codigo: string }> {
  const out = new Map<string, { fonte: FonteBase; codigo: string }>()
  orc.itens_planilha.forEach((e) =>
    e.servicos.forEach((s) => {
      if (s.fonte !== "PROPRIA") out.set(chaveEntidade(s.fonte, s.codigo), { fonte: s.fonte, codigo: s.codigo })
    }),
  )
  return Array.from(out.values())
}

/** Resolve a base a usar para um edital: sugerida pela IA -> padrão do sistema -> null. */
export async function resolverBaseSugerida(ai: AiEditalResponse): Promise<string | null> {
  const s = ai.metadados.bancoSugerido
  const sugerida = montarBaseId(s.orgao, s.uf, s.mesAno)
  if ((await getDoc(doc(getDb(), "catalogo_bases", sugerida))).exists()) return sugerida
  const params = await obterParametrosGerais()
  return (s.orgao === "SINAPI" ? params.base_padrao_sinapi : params.base_padrao_goinfra) ?? null
}

/**
 * Reconciliação automática (hydration): JSON da IA -> busca CPUs/insumos no
 * Firestore -> rascunho completo do orçamento.
 */
export async function hidratarOrcamentoDeIA(
  ai: AiEditalResponse,
  atual: OrcamentoLicita,
  baseIdForcada?: string | null,
): Promise<{ orcamento: OrcamentoLicita; base: BaseReferencia }> {
  const baseId = baseIdForcada ?? (await resolverBaseSugerida(ai))
  const base = baseId ? await carregarBaseReferencia(baseId, codigosParaHidratacao(ai)) : baseVazia(null)
  return { orcamento: montarOrcamentoDeEdital(ai, base, atual), base }
}

/** Busca a nova base no Firestore e executa `migrarBaseOrcamento`. */
export async function executarMigracaoBase(
  orc: OrcamentoLicita,
  baseAtual: BaseReferencia,
  novoBaseId: string,
): Promise<ResultadoMigracao & { base: BaseReferencia }> {
  const novaBase = await carregarBaseReferencia(novoBaseId, codigosDoOrcamento(orc))
  return { ...migrarBaseOrcamento(orc, baseAtual, novaBase), base: novaBase }
}

/* ============================================================================
 * Importação de planilhas CSV/XLSX (SINAPI / GOINFRA)
 * ========================================================================== */

export type TipoArquivoBase = "insumos" | "composicoes"
export type RegimePreco = "nao_desonerado" | "desonerado"

export interface InsumoImportado {
  codigo: string
  descricao: string
  unidade: string
  tipo: TipoInsumo
  preco?: number
  preco_desonerado?: number
  preco_nao_desonerado?: number
}

export interface ComposicaoImportada {
  codigo: string
  descricao: string
  unidade: string
  custo?: number
  itens: Array<{ tipo: "insumo" | "composicao"; codigo: string; coeficiente: number }>
}

export interface ResultadoParse<T> {
  registros: T[]
  colunas: Record<string, string>
  linhaCabecalho: number
  avisos: string[]
}

const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** Converte "1.234,56" | "1234.56" | 1234.56 em número. */
export function parseNumeroBR(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "")
  if (!s) return undefined
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s)
  return Number.isFinite(n) ? n : undefined
}

type Matcher = (h: string) => boolean
const igualOuInicia = (...aliases: string[]): Matcher => (h) => aliases.some((a) => h === a || h.startsWith(a + " "))
const contem = (...partes: string[]): Matcher => (h) => partes.every((p) => h.includes(p))

const COLUNAS_INSUMOS: Record<string, Matcher> = {
  codigo: igualOuInicia("codigo do insumo", "codigo insumo", "cod insumo", "codigo", "cod"),
  descricao: igualOuInicia("descricao do insumo", "descricao insumo", "descricao", "insumo"),
  unidade: igualOuInicia("unidade de medida", "unidade", "unid", "und", "un"),
  preco_nao_desonerado: (h) => h.includes("desoner") && (h.includes("nao") || h.includes("sem")),
  preco_desonerado: (h) => h.includes("desoner") && !h.includes("nao") && !h.includes("sem"),
  preco: (h) => /^(preco|custo|valor)/.test(h) && !h.includes("desoner"),
  tipo: igualOuInicia("tipo de insumo", "tipo insumo", "classe", "categoria", "tipo"),
}

const COLUNAS_COMPOSICOES: Record<string, Matcher> = {
  comp_codigo: (h) => contem("codigo", "composicao")(h) || h === "cod composicao",
  comp_descricao: contem("descricao", "composicao"),
  comp_unidade: (h) => contem("unidade", "composicao")(h) || h === "unidade",
  comp_custo: (h) => /^(custo total|custo composicao|preco composicao|custo)/.test(h),
  item_tipo: (h) => contem("tipo", "item")(h) || h === "tipo",
  item_codigo: (h) => contem("codigo", "item")(h) || h === "cod item",
  item_coef: igualOuInicia("coeficiente", "coef", "quantidade"),
}

async function lerLinhas(file: File): Promise<unknown[][]> {
  const nome = file.name.toLowerCase()
  let wb: XLSX.WorkBook
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    const buf = await file.arrayBuffer()
    let texto = new TextDecoder("utf-8").decode(buf)
    if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(buf) // CSVs oficiais em Latin-1
    texto = texto.replace(/^sep=.\r?\n/i, "")
    wb = XLSX.read(texto, { type: "string", raw: true })
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
  }
  // Escolhe a aba com mais linhas (planilhas oficiais trazem abas de capa/notas)
  const abas = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" }))
  return abas.sort((a, b) => b.length - a.length)[0] ?? []
}

function mapearCabecalho(linhas: unknown[][], regras: Record<string, Matcher>, obrigatorias: string[]) {
  for (let i = 0; i < Math.min(40, linhas.length); i++) {
    const headers = (linhas[i] ?? []).map(normalizar)
    const mapa: Record<string, number> = {}
    for (const [campo, match] of Object.entries(regras)) {
      const idx = headers.findIndex((h, j) => h && match(h) && !Object.values(mapa).includes(j))
      if (idx >= 0) mapa[campo] = idx
    }
    if (obrigatorias.every((c) => c in mapa)) return { linha: i, mapa, headers: linhas[i] as unknown[] }
  }
  return null
}

export function classificarTipoInsumo(descricao: string, unidade: string, tipoInformado?: string): TipoInsumo {
  const t = normalizar(tipoInformado)
  if (t) {
    if (t.includes("mao") || t.includes("obra")) return "MaoDeObra"
    if (t.includes("equip")) return "Equipamento"
    if (t.includes("mat")) return "Material"
  }
  const u = normalizar(unidade)
  const d = normalizar(descricao)
  if (u === "chp" || u === "chi" || /\b(caminhao|retroescavadeira|betoneira|escavadeira|rolo compactador|trator)\b/.test(d)) return "Equipamento"
  if ((u === "h" || u === "mes") && /\b(servente|pedreiro|carpinteiro|armador|eletricista|encanador|pintor|engenheiro|mestre|ajudante|operador|motorista|encarregado|tecnico)\b/.test(d)) return "MaoDeObra"
  return "Material"
}

export async function parsePlanilhaInsumos(file: File): Promise<ResultadoParse<InsumoImportado>> {
  const linhas = await lerLinhas(file)
  const cab = mapearCabecalho(linhas, COLUNAS_INSUMOS, ["codigo", "descricao"])
  if (!cab) throw new Error("Cabeçalho não reconhecido. Esperado: CÓDIGO, DESCRIÇÃO, UNIDADE, PREÇO.")
  const { mapa } = cab
  if (!("preco" in mapa || "preco_desonerado" in mapa || "preco_nao_desonerado" in mapa)) {
    throw new Error("Nenhuma coluna de preço identificada (PREÇO / PREÇO MEDIANO / DESONERADO).")
  }
  const avisos: string[] = []
  const registros: InsumoImportado[] = []
  for (const row of linhas.slice(cab.linha + 1)) {
    const codigo = String(row[mapa.codigo] ?? "").trim()
    if (!codigo || !/\d/.test(codigo)) continue
    const descricao = String(row[mapa.descricao] ?? "").trim()
    const unidade = String(row[mapa.unidade] ?? "").trim()
    registros.push({
      codigo,
      descricao,
      unidade,
      tipo: classificarTipoInsumo(descricao, unidade, mapa.tipo != null ? String(row[mapa.tipo]) : undefined),
      preco: mapa.preco != null ? parseNumeroBR(row[mapa.preco]) : undefined,
      preco_desonerado: mapa.preco_desonerado != null ? parseNumeroBR(row[mapa.preco_desonerado]) : undefined,
      preco_nao_desonerado: mapa.preco_nao_desonerado != null ? parseNumeroBR(row[mapa.preco_nao_desonerado]) : undefined,
    })
  }
  if (!registros.length) avisos.push("Nenhum insumo válido encontrado após o cabeçalho.")
  const colunas = Object.fromEntries(Object.entries(mapa).map(([k, i]) => [k, String(cab.headers[i])]))
  return { registros, colunas, linhaCabecalho: cab.linha + 1, avisos }
}

export async function parsePlanilhaComposicoes(file: File): Promise<ResultadoParse<ComposicaoImportada>> {
  const linhas = await lerLinhas(file)
  const cab = mapearCabecalho(linhas, COLUNAS_COMPOSICOES, ["comp_codigo", "item_codigo", "item_coef"])
  if (!cab) {
    throw new Error("Cabeçalho analítico não reconhecido. Esperado: CÓDIGO DA COMPOSIÇÃO, TIPO ITEM, CÓDIGO ITEM, COEFICIENTE.")
  }
  const { mapa } = cab
  const comps = new Map<string, ComposicaoImportada>()
  const avisos: string[] = []
  for (const row of linhas.slice(cab.linha + 1)) {
    const codigo = String(row[mapa.comp_codigo] ?? "").trim()
    if (!codigo || !/\d/.test(codigo)) continue
    let comp = comps.get(codigo)
    if (!comp) {
      comp = { codigo, descricao: "", unidade: "", itens: [] }
      comps.set(codigo, comp)
    }
    const desc = mapa.comp_descricao != null ? String(row[mapa.comp_descricao] ?? "").trim() : ""
    const und = mapa.comp_unidade != null ? String(row[mapa.comp_unidade] ?? "").trim() : ""
    const custo = mapa.comp_custo != null ? parseNumeroBR(row[mapa.comp_custo]) : undefined
    const itemCodigo = String(row[mapa.item_codigo] ?? "").trim()

    if (!itemCodigo) {
      // Linha-cabeçalho da composição
      comp.descricao ||= desc
      comp.unidade ||= und
      if (custo != null) comp.custo = custo
      continue
    }
    comp.descricao ||= desc
    comp.unidade ||= und
    const tipoItem = normalizar(mapa.item_tipo != null ? row[mapa.item_tipo] : "")
    comp.itens.push({
      tipo: tipoItem.includes("compos") ? "composicao" : "insumo",
      codigo: itemCodigo,
      coeficiente: parseNumeroBR(row[mapa.item_coef]) ?? 0,
    })
  }
  const registros = Array.from(comps.values())
  const vazias = registros.filter((c) => !c.itens.length).length
  if (vazias) avisos.push(`${vazias} composição(ões) sem itens analíticos.`)
  const colunas = Object.fromEntries(Object.entries(mapa).map(([k, i]) => [k, String(cab.headers[i])]))
  return { registros, colunas, linhaCabecalho: cab.linha + 1, avisos }
}

export interface ImportacaoBaseParams {
  orgao: FonteBase
  uf: string
  mesAno: string           // YYYY-MM
  regime: RegimePreco      // regime dos preços quando houver coluna única de preço
  insumos?: InsumoImportado[]
  composicoes?: ComposicaoImportada[]
  onProgress?: (percentual: number, gravados: number, total: number) => void
}

/**
 * Grava a base no Firestore em lotes de 450 documentos por `writeBatch()`,
 * usando `merge` para permitir subir os arquivos desonerado e não desonerado
 * em momentos diferentes sem perder dados.
 */
export async function importarBaseEmLote(p: ImportacaoBaseParams): Promise<CatalogoBase> {
  const db = getDb()
  const baseId = montarBaseId(p.orgao, p.uf, p.mesAno)
  const campoPreco = p.regime === "desonerado" ? "preco_base_desonerado" : "preco_base"
  const campoCusto = p.regime === "desonerado" ? "custo_referencia_desonerado" : "custo_referencia"

  type Op = { colecao: "insumos" | "composicoes"; id: string; data: Record<string, unknown> }
  const ops: Op[] = []

  for (const i of p.insumos ?? []) {
    const data: Record<string, unknown> = {
      codigo: i.codigo, fonte: p.orgao, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo,
    }
    if (i.preco != null) data[campoPreco] = i.preco
    if (i.preco_nao_desonerado != null) data.preco_base = i.preco_nao_desonerado
    if (i.preco_desonerado != null) data.preco_base_desonerado = i.preco_desonerado
    ops.push({ colecao: "insumos", id: docIdDeCodigo(i.codigo), data })
  }
  for (const c of p.composicoes ?? []) {
    const data: Record<string, unknown> = {
      codigo: c.codigo,
      fonte: p.orgao,
      descricao: c.descricao,
      unidade: c.unidade,
      insumos: c.itens.filter((x) => x.tipo === "insumo").map((x) => ({ id_insumo: chaveEntidade(p.orgao, x.codigo), coeficiente: x.coeficiente })),
      composicoes_auxiliares: c.itens
        .filter((x) => x.tipo === "composicao")
        .map((x) => ({ id_composicao: chaveEntidade(p.orgao, x.codigo), coeficiente: x.coeficiente })),
    }
    if (c.custo != null) data[campoCusto] = c.custo
    ops.push({ colecao: "composicoes", id: docIdDeCodigo(c.codigo), data })
  }

  const total = ops.length
  let gravados = 0
  p.onProgress?.(0, 0, total)
  for (const bloco of chunk(ops, TAMANHO_CHUNK)) {
    const batch = writeBatch(db)
    for (const op of bloco) {
      batch.set(doc(db, "bases_oficiais", baseId, op.colecao, op.id), op.data, { merge: true })
    }
    await batch.commit()
    gravados += bloco.length
    p.onProgress?.(Math.round((gravados / Math.max(1, total)) * 100), gravados, total)
  }

  const metaRef = doc(db, "catalogo_bases", baseId)
  const anterior = (await getDoc(metaRef)).data() as Partial<CatalogoBase> | undefined
  const meta: CatalogoBase = {
    id: baseId,
    orgao: p.orgao,
    uf: p.uf.toUpperCase(),
    mes_ano: p.mesAno,
    descricao: `${p.orgao} ${p.uf.toUpperCase()} — ${p.mesAno.split("-").reverse().join("/")}`,
    total_insumos: p.insumos?.length ? p.insumos.length : anterior?.total_insumos ?? 0,
    total_composicoes: p.composicoes?.length ? p.composicoes.length : anterior?.total_composicoes ?? 0,
    possui_desonerado: Boolean(anterior?.possui_desonerado) || p.regime === "desonerado",
    possui_nao_desonerado: Boolean(anterior?.possui_nao_desonerado) || p.regime === "nao_desonerado",
    criado_em: anterior?.criado_em ?? new Date().toISOString(),
  }
  await setDoc(metaRef, meta, { merge: true })
  return meta
}

