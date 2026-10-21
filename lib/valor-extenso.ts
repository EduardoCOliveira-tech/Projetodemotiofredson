// lib/valor-extenso.ts
// Conversão de números e valores monetários (R$) para extenso em português (pt-BR).
// Suporta valores até a casa dos trilhões, com as regras usuais de conjunção
// ("mil e quinhentos", "dois milhões e trezentos mil") e "de reais" para milhões exatos.

const UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
]
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
]
const ESCALAS: Array<[string, string]> = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
  ["trilhão", "trilhões"],
]

/** Converte um inteiro entre 0 e 999 para extenso. */
function ate999(n: number): string {
  if (n === 0) return ""
  if (n === 100) return "cem"
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c > 0) partes.push(CENTENAS[c])
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto])
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${UNIDADES[u]}`)
    }
  }
  return partes.join(" e ")
}

/** Converte um número inteiro não negativo para extenso (ex.: 1250 -> "mil duzentos e cinquenta"). */
export function numeroPorExtenso(valor: number): string {
  let n = Math.floor(Math.abs(valor))
  if (n === 0) return "zero"

  const grupos: number[] = []
  while (n > 0) {
    grupos.push(n % 1000)
    n = Math.floor(n / 1000)
  }
  if (grupos.length > ESCALAS.length) return String(Math.floor(Math.abs(valor)))

  const partes: Array<{ escala: number; grupo: number; texto: string }> = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (g === 0) continue
    let texto: string
    if (i === 0) texto = ate999(g)
    else if (i === 1) texto = g === 1 ? "mil" : `${ate999(g)} mil`
    else texto = `${ate999(g)} ${g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]}`
    partes.push({ escala: i, grupo: g, texto })
  }

  let saida = ""
  partes.forEach((p, idx) => {
    if (idx === 0) {
      saida = p.texto
      return
    }
    const ultimo = idx === partes.length - 1
    let separador = ", "
    if (ultimo && (p.grupo < 100 || p.grupo % 100 === 0)) separador = " e "
    else if (ultimo && p.escala === 0) separador = " "
    saida += separador + p.texto
  })
  return saida
}

/** Converte um valor monetário em reais para extenso (ex.: 1500.5 -> "mil e quinhentos reais e cinquenta centavos"). */
export function valorExtenso(valor: number): string {
  if (!Number.isFinite(valor)) return ""
  const negativo = valor < 0
  const totalCentavos = Math.round(Math.abs(valor) * 100)
  const inteiro = Math.floor(totalCentavos / 100)
  const centavos = totalCentavos % 100

  if (inteiro === 0 && centavos === 0) return "zero real"

  const partes: string[] = []
  if (inteiro > 0) {
    const sufixo = inteiro === 1 ? "real" : inteiro % 1_000_000 === 0 ? "de reais" : "reais"
    partes.push(`${numeroPorExtenso(inteiro)} ${sufixo}`)
  }
  if (centavos > 0) {
    partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`)
  }
  const texto = partes.join(" e ")
  return negativo ? `menos ${texto}` : texto
}

