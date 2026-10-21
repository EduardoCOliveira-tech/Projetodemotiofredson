// lib/budget-engine.ts
// Motor de cálculo PURO (sem React / sem Firestore) do orçamento de licitação.
// Cadeia reativa:
//   Preço Insumo (base ou modificado) -> Custo Direto da CPU -> Preço Unitário c/ BDI
//   -> Total do Item -> Total da Etapa -> Cronograma -> Valor Global da Proposta

import type {
  AiEditalResponse,
  BaseReferencia,
  ComposicaoCPU,
  ConfigBDI,
  ConfigCronograma,
  EtapaPlanilha,
  FonteBase,
  InsumoBase,
  InsumoModificado,
  ModoArredondamento,
  OrcamentoLicita,
  ServicoPlanilha,
  TipoInsumo,
} from "./proposal-types"
import { chaveEntidade } from "./proposal-types"

/* ============================================================================
 * 1. ARREDONDAMENTO (2 casas) — tolerante a ruído de ponto flutuante
 * ========================================================================== */

/** Remove ruído binário (ex.: 1.15 * 100 = 114.99999999999999). */
const limparRuido = (v: number) => Number(v.toFixed(8))

/** Truncamento em 2 casas (padrão SINAPI): 10.459 -> 10.45 */
export function truncar2(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  return Math.trunc(limparRuido(valor * 100)) / 100
}

/** Arredondamento "half-up" simétrico em 2 casas: 10.455 -> 10.46 */
export function arredondar2(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  const n = limparRuido(valor * 100)
  return (Math.sign(n) * Math.round(Math.abs(n))) / 100
}

export function aplicarArredondamento(valor: number, modo: ModoArredondamento): number {
  return modo === "truncar_2_casas" ? truncar2(valor) : arredondar2(valor)
}

/* ============================================================================
 * 2. BDI — Acórdão 2.622/2013-TCU-Plenário
 *    BDI = (((1 + AC + S + R + G) * (1 + DF) * (1 + L)) / (1 - I)) - 1
 * ========================================================================== */

export interface ResultadoBDI {
  /** BDI exato (fração). */
  bdi_exato: number
  /** BDI em % com 2 casas — valor declarado e efetivamente aplicado nos preços. */
  bdi_percentual: number
  /** Fração aplicada (= bdi_percentual / 100). */
  bdi_aplicado: number
  /** Soma dos tributos (fração), já incluindo CPRB quando desonerado. */
  impostos_total: number
  cprb_aplicada: number
  valido: boolean
  erro?: string
}

const pct = (v: number | undefined | null) => (Number(v) || 0) / 100

export function calcularBDI(cfg: ConfigBDI, desonerado: boolean): ResultadoBDI {
  const AC = pct(cfg.ac)
  const S = pct(cfg.s)
  const R = pct(cfg.r)
  const G = pct(cfg.g)
  const DF = pct(cfg.df)
  const L = pct(cfg.lucro)
  const cprb = desonerado ? pct(cfg.cprb) : 0
  const I = pct(cfg.pis) + pct(cfg.cofins) + pct(cfg.iss) + cprb

  if (I >= 1) {
    return {
      bdi_exato: 0, bdi_percentual: 0, bdi_aplicado: 0, impostos_total: I, cprb_aplicada: cprb,
      valido: false, erro: "Somatório de tributos (I) deve ser inferior a 100%.",
    }
  }

  const bdi = ((1 + AC + S + R + G) * (1 + DF) * (1 + L)) / (1 - I) - 1
  const bdiPct = arredondar2(bdi * 100)
  return {
    bdi_exato: bdi,
    bdi_percentual: bdiPct,
    bdi_aplicado: bdiPct / 100,
    impostos_total: I,
    cprb_aplicada: cprb,
    valido: true,
  }
}

/**
 * Faixas referenciais do Acórdão 2.622/2013-TCU para "Construção de Edifícios"
 * (1º quartil / médio / 3º quartil), em %. Usadas apenas para sinalização na UI.
 */
export const FAIXAS_TCU_EDIFICACOES = {
  ac: [3.0, 4.0, 5.5],
  sg: [0.8, 0.8, 1.0],
  r: [0.97, 1.27, 1.27],
  df: [0.59, 1.23, 1.39],
  lucro: [6.16, 7.4, 8.96],
  bdi: [20.34, 22.12, 25.0],
} as const

export const BDI_PADRAO: ConfigBDI = {
  ac: 4.0, s: 0.4, r: 1.27, g: 0.4, df: 1.23, lucro: 7.4,
  pis: 0.65, cofins: 3.0, iss: 2.5, cprb: 4.5,
}

/* ============================================================================
 * 3. PREÇO DE INSUMO (base -> deságio)
 * ========================================================================== */

export function precoBaseInsumo(insumo: InsumoBase, desonerado: boolean): number {
  const pd = insumo.preco_base_desonerado
  const pn = insumo.preco_base
  if (desonerado) return pd ?? pn ?? 0
  return pn ?? pd ?? 0
}

export function aplicarDesagio(
  precoBase: number,
  mod: InsumoModificado | undefined,
  modo: ModoArredondamento,
): number {
  if (!mod) return precoBase
  if (mod.modo === "valor_fixo") return aplicarArredondamento(Math.max(0, mod.novo_preco || 0), modo)
  const d = Math.min(100, Math.max(-100, mod.desconto_percentual || 0))
  return aplicarArredondamento(precoBase * (1 - d / 100), modo)
}

/* ============================================================================
 * 4. CPU — Explosão recursiva da composição (com auxiliares e detecção de ciclo)
 * ========================================================================== */

export interface LinhaCPU {
  tipo: "insumo" | "composicao"
  id: string
  codigo: string
  descricao: string
  unidade: string
  coeficiente: number
  tipo_insumo?: TipoInsumo
  preco_base: number          // sem deságio
  preco_unitario: number      // com deságio (para composição = custo da auxiliar)
  custo_parcial: number       // coef * preco_unitario (arredondado)
  custo_parcial_base: number  // coef * preco_base (arredondado)
  modificado: boolean
  orfao: boolean
  filhos?: LinhaCPU[]
}

export interface ResultadoCPU {
  id: string
  custo_direto: number
  custo_direto_base: number
  linhas: LinhaCPU[]
  possui_desagio: boolean
  possui_orfao: boolean
}

interface CtxCalculo {
  base: BaseReferencia
  desonerado: boolean
  modo: ModoArredondamento
  mods: Record<string, InsumoModificado>
  memoCPU: Map<string, ResultadoCPU>
}

function precoInsumoCtx(id: string, ctx: CtxCalculo) {
  const ins = ctx.base.insumos[id]
  if (!ins) return { base: 0, atual: 0, insumo: undefined as InsumoBase | undefined }
  const base = precoBaseInsumo(ins, ctx.desonerado)
  const atual = aplicarDesagio(base, ctx.mods[id], ctx.modo)
  return { base, atual, insumo: ins }
}

function calcularCPU(id: string, ctx: CtxCalculo, pilha: Set<string> = new Set()): ResultadoCPU {
  const memo = ctx.memoCPU.get(id)
  if (memo) return memo

  const comp: ComposicaoCPU | undefined = ctx.base.composicoes[id]
  if (!comp || pilha.has(id)) {
    return { id, custo_direto: 0, custo_direto_base: 0, linhas: [], possui_desagio: false, possui_orfao: true }
  }
  pilha.add(id)
  const arr = (v: number) => aplicarArredondamento(v, ctx.modo)
  const linhas: LinhaCPU[] = []
  let possuiDesagio = false
  let possuiOrfao = false

  for (const ci of comp.composicoes_auxiliares ?? []) {
    const aux = calcularCPU(ci.id_composicao, ctx, pilha)
    const auxComp = ctx.base.composicoes[ci.id_composicao]
    const orfao = !auxComp
    possuiDesagio ||= aux.possui_desagio
    possuiOrfao ||= aux.possui_orfao || orfao
    linhas.push({
      tipo: "composicao",
      id: ci.id_composicao,
      codigo: auxComp?.codigo ?? ci.id_composicao.split(":").pop() ?? ci.id_composicao,
      descricao: auxComp?.descricao ?? "COMPOSIÇÃO NÃO ENCONTRADA NA BASE",
      unidade: auxComp?.unidade ?? "-",
      coeficiente: ci.coeficiente,
      preco_base: aux.custo_direto_base,
      preco_unitario: aux.custo_direto,
      custo_parcial: arr(ci.coeficiente * aux.custo_direto),
      custo_parcial_base: arr(ci.coeficiente * aux.custo_direto_base),
      modificado: aux.possui_desagio,
      orfao,
      filhos: aux.linhas,
    })
  }

  for (const ii of comp.insumos ?? []) {
    const { base, atual, insumo } = precoInsumoCtx(ii.id_insumo, ctx)
    const modificado = !!ctx.mods[ii.id_insumo] && !!insumo
    possuiDesagio ||= modificado
    possuiOrfao ||= !insumo
    linhas.push({
      tipo: "insumo",
      id: ii.id_insumo,
      codigo: insumo?.codigo ?? ii.id_insumo.split(":").pop() ?? ii.id_insumo,
      descricao: insumo?.descricao ?? "INSUMO NÃO ENCONTRADO NA BASE",
      unidade: insumo?.unidade ?? "-",
      tipo_insumo: insumo?.tipo,
      coeficiente: ii.coeficiente,
      preco_base: base,
      preco_unitario: atual,
      custo_parcial: arr(ii.coeficiente * atual),
      custo_parcial_base: arr(ii.coeficiente * base),
      modificado,
      orfao: !insumo,
    })
  }

  const resultado: ResultadoCPU = {
    id,
    custo_direto: arr(linhas.reduce((a, l) => a + l.custo_parcial, 0)),
    custo_direto_base: arr(linhas.reduce((a, l) => a + l.custo_parcial_base, 0)),
    linhas,
    possui_desagio: possuiDesagio,
    possui_orfao: possuiOrfao,
  }
  pilha.delete(id)
  ctx.memoCPU.set(id, resultado)
  return resultado
}

/* ============================================================================
 * 5. CÁLCULO COMPLETO DO ORÇAMENTO
 * ========================================================================== */

export type TipoReferencia = "composicao" | "insumo" | "manual"

export interface ResultadoServico {
  servico: ServicoPlanilha
  etapa_id: string
  tipo_ref: TipoReferencia
  ref_id: string | null
  custo_unitario: number
  custo_unitario_base: number
  preco_unitario: number
  total: number
  total_teto: number | null
  cpu?: ResultadoCPU
  orfao: boolean
  acima_teto: boolean
  com_desagio: boolean
}

export interface ResultadoEtapa {
  etapa: EtapaPlanilha
  servicos: ResultadoServico[]
  custo_direto_total: number
  total: number
  percentual_global: number
}

export interface LinhaABC {
  id: string
  codigo: string
  fonte: FonteBase
  descricao: string
  unidade: string
  tipo: TipoInsumo
  quantidade_total: number
  preco_base: number
  preco_atual: number
  valor_base: number
  valor_total: number
  percentual: number
  percentual_acumulado: number
  classe: "A" | "B" | "C"
  modificacao?: InsumoModificado
}

export interface ResultadoCronograma {
  meses: number
  linhas: Array<{ etapa_id: string; item: string; descricao: string; total: number; percentuais: number[]; valores: number[]; soma_percentual: number }>
  total_mes: number[]
  acumulado_mes: number[]
  percentual_mes: number[]
  percentual_acumulado: number[]
}

export interface ResultadoOrcamento {
  bdi: ResultadoBDI
  etapas: ResultadoEtapa[]
  custo_direto_total: number
  custo_direto_base_total: number
  valor_global: number
  valor_teto_edital: number
  desconto_sobre_edital_pct: number
  qtd_orfaos: number
  qtd_acima_teto: number
  qtd_servicos: number
  curva_abc: LinhaABC[]
  cronograma: ResultadoCronograma
}

export function resolverReferencia(s: ServicoPlanilha, base: BaseReferencia): { tipo: TipoReferencia; id: string | null } {
  if (s.fonte === "PROPRIA") return { tipo: "manual", id: null }
  const id = chaveEntidade(s.fonte, s.codigo)
  if (base.composicoes[id]) return { tipo: "composicao", id }
  if (base.insumos[id]) return { tipo: "insumo", id }
  return { tipo: "manual", id: null }
}

export function calcularOrcamento(orc: OrcamentoLicita, base: BaseReferencia): ResultadoOrcamento {
  const modo = orc.arredondamento
  const arr = (v: number) => aplicarArredondamento(v, modo)
  const bdi = calcularBDI(orc.bdi, orc.desonerado)
  const fator = 1 + (bdi.valido ? bdi.bdi_aplicado : 0)

  const ctx: CtxCalculo = {
    base, desonerado: orc.desonerado, modo, mods: orc.insumos_modificados ?? {}, memoCPU: new Map(),
  }

  // Acumulador da Curva ABC: id do insumo -> quantidade total consumida
  const consumo = new Map<string, number>()
  const acumularConsumo = (linhas: LinhaCPU[], multiplicador: number) => {
    for (const l of linhas) {
      const q = multiplicador * l.coeficiente
      if (l.tipo === "insumo") {
        if (!l.orfao) consumo.set(l.id, (consumo.get(l.id) ?? 0) + q)
      } else if (l.filhos) acumularConsumo(l.filhos, q)
    }
  }

  let qtdOrfaos = 0
  let qtdAcimaTeto = 0
  let qtdServicos = 0
  let valorTeto = 0

  const etapas: ResultadoEtapa[] = orc.itens_planilha.map((etapa) => {
    const servicos = etapa.servicos.map((s): ResultadoServico => {
      qtdServicos++
      const ref = resolverReferencia(s, base)
      let custo = 0
      let custoBase = 0
      let cpu: ResultadoCPU | undefined
      let comDesagio = false

      if (ref.tipo === "composicao" && ref.id) {
        cpu = calcularCPU(ref.id, ctx)
        custo = cpu.custo_direto
        custoBase = cpu.custo_direto_base
        comDesagio = cpu.possui_desagio
        acumularConsumo(cpu.linhas, s.quantidade)
      } else if (ref.tipo === "insumo" && ref.id) {
        const p = precoInsumoCtx(ref.id, ctx)
        custo = p.atual
        custoBase = p.base
        comDesagio = !!ctx.mods[ref.id]
        consumo.set(ref.id, (consumo.get(ref.id) ?? 0) + s.quantidade)
      } else {
        custo = arr(s.custo_unitario_manual ?? 0)
        custoBase = custo
      }

      const orfao = s.fonte !== "PROPRIA" && ref.tipo === "manual"
      const pu = arr(custo * fator)
      const total = arr(pu * (s.quantidade || 0))
      const teto = s.preco_unitario_edital
      const acimaTeto = teto != null && teto > 0 && pu > teto + 0.0001
      const totalTeto = teto != null ? arr(teto * (s.quantidade || 0)) : null
      if (orfao) qtdOrfaos++
      if (acimaTeto) qtdAcimaTeto++
      valorTeto += totalTeto ?? total

      return {
        servico: s, etapa_id: etapa.id, tipo_ref: ref.tipo, ref_id: ref.id,
        custo_unitario: custo, custo_unitario_base: custoBase,
        preco_unitario: pu, total, total_teto: totalTeto, cpu,
        orfao, acima_teto: acimaTeto, com_desagio: comDesagio,
      }
    })
    return {
      etapa,
      servicos,
      custo_direto_total: arr(servicos.reduce((a, r) => a + r.custo_unitario * (r.servico.quantidade || 0), 0)),
      total: arr(servicos.reduce((a, r) => a + r.total, 0)),
      percentual_global: 0,
    }
  })

  const valorGlobal = arr(etapas.reduce((a, e) => a + e.total, 0))
  etapas.forEach((e) => (e.percentual_global = valorGlobal > 0 ? (e.total / valorGlobal) * 100 : 0))

  const custoDireto = arr(etapas.reduce((a, e) => a + e.custo_direto_total, 0))
  const custoDiretoBase = arr(
    etapas.reduce((a, e) => a + e.servicos.reduce((b, r) => b + r.custo_unitario_base * (r.servico.quantidade || 0), 0), 0),
  )

  return {
    bdi,
    etapas,
    custo_direto_total: custoDireto,
    custo_direto_base_total: custoDiretoBase,
    valor_global: valorGlobal,
    valor_teto_edital: arr(valorTeto),
    desconto_sobre_edital_pct: valorTeto > 0 ? (1 - valorGlobal / valorTeto) * 100 : 0,
    qtd_orfaos: qtdOrfaos,
    qtd_acima_teto: qtdAcimaTeto,
    qtd_servicos: qtdServicos,
    curva_abc: gerarCurvaABC(consumo, ctx),
    cronograma: calcularCronograma(orc.cronograma, etapas, modo),
  }
}

/* ============================================================================
 * 6. CURVA ABC DE INSUMOS (em memória)
 *    A: até 80% do custo acumulado | B: 80–95% | C: restante
 * ========================================================================== */

function gerarCurvaABC(consumo: Map<string, number>, ctx: CtxCalculo): LinhaABC[] {
  const linhas: LinhaABC[] = []
  consumo.forEach((qtd, id) => {
    const p = precoInsumoCtx(id, ctx)
    if (!p.insumo) return
    linhas.push({
      id,
      codigo: p.insumo.codigo,
      fonte: p.insumo.fonte,
      descricao: p.insumo.descricao,
      unidade: p.insumo.unidade,
      tipo: p.insumo.tipo,
      quantidade_total: qtd,
      preco_base: p.base,
      preco_atual: p.atual,
      valor_base: arredondar2(qtd * p.base),
      valor_total: arredondar2(qtd * p.atual),
      percentual: 0,
      percentual_acumulado: 0,
      classe: "C",
      modificacao: ctx.mods[id],
    })
  })
  linhas.sort((a, b) => b.valor_total - a.valor_total)
  const total = linhas.reduce((a, l) => a + l.valor_total, 0)
  let acumulado = 0
  for (const l of linhas) {
    const anterior = acumulado
    l.percentual = total > 0 ? (l.valor_total / total) * 100 : 0
    acumulado += l.percentual
    l.percentual_acumulado = acumulado
    l.classe = anterior < 80 ? "A" : anterior < 95 ? "B" : "C"
  }
  return linhas
}

/* ============================================================================
 * 7. CRONOGRAMA FÍSICO-FINANCEIRO (vinculado aos totais das etapas)
 * ========================================================================== */

export function distribuicaoUniforme(meses: number): number[] {
  if (meses <= 0) return []
  const base = Math.floor((100 / meses) * 100) / 100
  const arr = Array(meses).fill(base)
  arr[meses - 1] = arredondar2(100 - base * (meses - 1))
  return arr
}

function calcularCronograma(cfg: ConfigCronograma, etapas: ResultadoEtapa[], modo: ModoArredondamento): ResultadoCronograma {
  const meses = Math.max(1, cfg.prazo_meses || 1)
  const arr = (v: number) => aplicarArredondamento(v, modo)
  const totalMes = Array(meses).fill(0)

  const linhas = etapas.map((e) => {
    const dist = cfg.distribuicao[e.etapa.id] ?? distribuicaoUniforme(meses)
    const percentuais = Array.from({ length: meses }, (_, i) => Number(dist[i]) || 0)
    const soma = percentuais.reduce((a, b) => a + b, 0)
    // Valores por mês; o último mês com execução absorve o resíduo de arredondamento
    const valores = percentuais.map((p) => arr((e.total * p) / 100))
    if (Math.abs(soma - 100) < 0.01) {
      const ultimo = percentuais.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0).pop()
      if (ultimo != null) {
        const somaValores = valores.reduce((a, b) => a + b, 0)
        valores[ultimo] = arredondar2(valores[ultimo] + (e.total - somaValores))
      }
    }
    valores.forEach((v, i) => (totalMes[i] += v))
    return { etapa_id: e.etapa.id, item: e.etapa.item, descricao: e.etapa.descricao, total: e.total, percentuais, valores, soma_percentual: soma }
  })

  const totalGeral = etapas.reduce((a, e) => a + e.total, 0)
  let acc = 0
  const acumulado = totalMes.map((v) => (acc = arredondar2(acc + v)))
  return {
    meses,
    linhas,
    total_mes: totalMes.map(arredondar2),
    acumulado_mes: acumulado,
    percentual_mes: totalMes.map((v) => (totalGeral > 0 ? (v / totalGeral) * 100 : 0)),
    percentual_acumulado: acumulado.map((v) => (totalGeral > 0 ? (v / totalGeral) * 100 : 0)),
  }
}

export function redimensionarCronograma(cfg: ConfigCronograma, etapaIds: string[], meses: number): ConfigCronograma {
  const m = Math.max(1, Math.min(120, Math.round(meses)))
  const distribuicao: Record<string, number[]> = {}
  for (const id of etapaIds) {
    const atual = cfg.distribuicao[id]
    distribuicao[id] = atual && atual.length === m ? atual : distribuicaoUniforme(m)
  }
  return { prazo_meses: m, distribuicao }
}

/* ============================================================================
 * 8. ENGENHARIA DE DESÁGIO (mutações puras)
 * ========================================================================== */

export function definirDesagioInsumo(orc: OrcamentoLicita, idInsumo: string, mod: InsumoModificado | null): OrcamentoLicita {
  const mods = { ...orc.insumos_modificados }
  if (!mod || (mod.modo === "percentual" && !mod.desconto_percentual)) delete mods[idInsumo]
  else mods[idInsumo] = mod
  return { ...orc, insumos_modificados: mods }
}

/** Aplica um desconto percentual linear a todos os insumos da Curva ABC filtrada. */
export function aplicarDescontoLinear(
  orc: OrcamentoLicita,
  curva: LinhaABC[],
  percentual: number,
  classes: Array<"A" | "B" | "C"> = ["A", "B", "C"],
  justificativa = "Desconto linear",
): OrcamentoLicita {
  const mods = { ...orc.insumos_modificados }
  for (const l of curva) {
    if (!classes.includes(l.classe)) continue
    if (!percentual) delete mods[l.id]
    else mods[l.id] = { modo: "percentual", desconto_percentual: percentual, novo_preco: 0, justificativa }
  }
  return { ...orc, insumos_modificados: mods }
}

/* ============================================================================
 * 9. MIGRAÇÃO DE BASE (ex.: SINAPI Maio -> SINAPI Outubro)
 * ========================================================================== */

export interface AlertaMigracao {
  nivel: "info" | "warning" | "error"
  codigo?: string
  mensagem: string
}

export interface ResultadoMigracao {
  orcamento: OrcamentoLicita
  alertas: AlertaMigracao[]
  resumo: {
    percentuais_reaplicados: number
    fixos_acima_teto: number
    insumos_extintos: number
    servicos_orfaos: number
    servicos_recuperados: number
    servicos_acima_teto_edital: number
    valor_anterior: number
    valor_novo: number
  }
}

/**
 * Migra o orçamento para uma nova base de referência:
 *  - atualiza preços base (implícito: o cálculo passa a ler `novaBase`);
 *  - reaplica descontos percentuais de `insumos_modificados` sobre os novos preços;
 *  - alerta quando um preço FIXO ultrapassa o novo teto oficial do insumo;
 *  - marca códigos extintos como órfãos, congelando o último custo conhecido.
 */
export function migrarBaseOrcamento(
  orc: OrcamentoLicita,
  baseAtual: BaseReferencia,
  novaBase: BaseReferencia,
): ResultadoMigracao {
  const alertas: AlertaMigracao[] = []
  const anterior = calcularOrcamento(orc, baseAtual)
  const custoAnterior = new Map<string, number>()
  anterior.etapas.forEach((e) => e.servicos.forEach((r) => custoAnterior.set(r.servico.id, r.custo_unitario)))

  let orfaos = 0
  let recuperados = 0
  const itens = orc.itens_planilha.map((etapa) => ({
    ...etapa,
    servicos: etapa.servicos.map((s) => {
      if (s.fonte === "PROPRIA") return s
      const existe = resolverReferencia(s, novaBase).tipo !== "manual"
      if (!existe) {
        orfaos++
        alertas.push({
          nivel: "error",
          codigo: s.codigo,
          mensagem: `Item ${s.item} — código ${s.fonte} ${s.codigo} extinto na nova base. Marcado como órfão (custo congelado).`,
        })
        return { ...s, orfao: true, custo_unitario_manual: s.custo_unitario_manual ?? custoAnterior.get(s.id) ?? 0 }
      }
      if (s.orfao) recuperados++
      return { ...s, orfao: false }
    }),
  }))

  let reaplicados = 0
  let fixosAcima = 0
  let extintos = 0
  for (const [id, mod] of Object.entries(orc.insumos_modificados ?? {})) {
    const novo = novaBase.insumos[id]
    if (!novo) {
      extintos++
      alertas.push({ nivel: "warning", codigo: id, mensagem: `Insumo ${id} não existe na nova base — deságio mantido, porém sem efeito.` })
      continue
    }
    if (mod.modo === "percentual") {
      reaplicados++
      continue
    }
    const teto = precoBaseInsumo(novo, orc.desonerado)
    if (mod.novo_preco > teto + 0.0001) {
      fixosAcima++
      alertas.push({
        nivel: "warning",
        codigo: novo.codigo,
        mensagem: `Preço fixo de ${novo.codigo} (R$ ${mod.novo_preco.toFixed(2)}) ultrapassa o novo teto oficial (R$ ${teto.toFixed(2)}).`,
      })
    }
  }
  if (reaplicados > 0) {
    alertas.unshift({ nivel: "info", mensagem: `${reaplicados} desconto(s) percentual(is) reaplicado(s) sobre os novos preços base.` })
  }

  const orcamento: OrcamentoLicita = {
    ...orc,
    ref_base_id: novaBase.base_id,
    itens_planilha: itens,
    atualizado_em: new Date().toISOString(),
  }
  const novo = calcularOrcamento(orcamento, novaBase)
  if (novo.qtd_acima_teto > 0) {
    alertas.push({ nivel: "warning", mensagem: `${novo.qtd_acima_teto} item(ns) com preço unitário acima do teto do edital após a migração.` })
  }

  return {
    orcamento,
    alertas,
    resumo: {
      percentuais_reaplicados: reaplicados,
      fixos_acima_teto: fixosAcima,
      insumos_extintos: extintos,
      servicos_orfaos: orfaos,
      servicos_recuperados: recuperados,
      servicos_acima_teto_edital: novo.qtd_acima_teto,
      valor_anterior: anterior.valor_global,
      valor_novo: novo.valor_global,
    },
  }
}

/* ============================================================================
 * 10. FÁBRICAS E HIDRATAÇÃO A PARTIR DA IA
 * ========================================================================== */

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)

export const MODELO_BASE_PADRAO = {
  num_proposta: `PROP-${new Date().getFullYear()}-001`,
  aos_cuidados: "Comissão Permanente de Contratação / Setor de Licitações",
  telefone_contato: "(62) 3000-0000",
  endereco_obra: "Conforme Termo de Referência / Edital",
  introducao_texto:
    "Apresentamos nossa Proposta Comercial e Técnica para execução dos serviços e obras de engenharia discriminados nesta planilha orçamentária, elaborada em estrita conformidade com o Edital, Projeto Básico, normas da ABNT vigentes, Lei nº 14.133/2021 e composições referenciais de custos (SINAPI / GOINFRA / Próprias).",
  metodologia_tecnica:
    "Os serviços serão executados por equipe técnica habilitada sob supervisão de Engenheiro Responsável Técnico (com emissão de ART/RRT), observando rigorosamente o controle tecnológico de materiais, as normas regulamentadoras de segurança do trabalho (NRs) e o cronograma físico-financeiro.",
  condicoes_pagamento:
    "Medições mensais conforme avanço físico-financeiro aferido pela fiscalização do contrato, nos termos do Edital.",
  observacoes: [
    "Nos preços unitários e global propostos estão inclusos todos os custos diretos, materiais, mão de obra, encargos sociais, equipamentos, transporte, BDI (Acórdão 2.622/2013-TCU) e tributos vigentes.",
    "Declaramos pleno conhecimento das condições locais e de todas as exigências técnicas do instrumento convocatório.",
    "Esta proposta respeita integralmente os limites de preços unitários e global estabelecidos no edital.",
  ],
  exibir_bdi_proposta: true,
  exibir_cronograma_proposta: true,
}

export function criarOrcamentoVazio(): OrcamentoLicita {
  const agora = new Date().toISOString()
  return {
    id: uid(),
    titulo: "Novo Orçamento de Licitação",
    origem: "zero",
    status: "rascunho",
    criado_em: agora,
    modelo_base: {
      ...MODELO_BASE_PADRAO,
      observacoes: [...MODELO_BASE_PADRAO.observacoes],
    },
    edital: {
      orgao: "", numero_edital: "", objeto: "", cliente: "", municipio_uf: "Goiânia/GO",
      data_proposta: agora.split("T")[0], local: "Goiânia/GO",
      validade_dias: 60, responsavel_tecnico: "", registro_profissional: "CREA/GO",
      empresa_licitante: "", cnpj_licitante: "", bdi_referencia_edital: null,
    },
    bdi: { ...BDI_PADRAO },
    desonerado: false,
    ref_base_id: "DEMO-SINAPI-GO-2026-05",
    insumos_modificados: {},
    itens_planilha: [
      {
        id: uid(),
        item: "1",
        descricao: "SERVIÇOS PRELIMINARES",
        servicos: [],
      },
    ],
    arredondamento: "truncar_2_casas",
    cronograma: { prazo_meses: 4, distribuicao: {} },
    exigencias_tecnicas: [],
    atualizado_em: agora,
  }
}

/** Lista de códigos (únicos) a buscar no Firestore a partir do retorno da IA. */
export function codigosParaHidratacao(ai: AiEditalResponse): Array<{ fonte: FonteBase; codigo: string }> {
  const vistos = new Set<string>()
  const out: Array<{ fonte: FonteBase; codigo: string }> = []
  for (const it of ai.itensExtraidos) {
    if (it.fonte === "PROPRIA" || !it.codigoReferencia) continue
    const k = chaveEntidade(it.fonte, it.codigoReferencia)
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push({ fonte: it.fonte, codigo: it.codigoReferencia.trim() })
  }
  return out
}

/**
 * Monta o rascunho completo do orçamento a partir do JSON da IA + base hidratada.
 * Itens sem correspondência na base viram órfãos com custo direto estimado
 * a partir do preço do edital "desonerado do BDI": PU_edital / (1 + BDI_edital).
 */
export function montarOrcamentoDeEdital(
  ai: AiEditalResponse,
  base: BaseReferencia,
  atual: OrcamentoLicita = criarOrcamentoVazio(),
): OrcamentoLicita {
  const m = ai.metadados
  const bdiEdital = m.bdiReferenciaEdital ?? calcularBDI(atual.bdi, m.regimeDesonerado).bdi_percentual
  const fatorEdital = 1 + (bdiEdital || 0) / 100

  const grupos = new Map<string, ServicoPlanilha[]>()
  for (const it of ai.itensExtraidos) {
    const nomeEtapa = (it.etapaSugerida || "SERVIÇOS GERAIS").trim().toUpperCase()
    const s: ServicoPlanilha = {
      id: uid(),
      item: it.itemHierarquia,
      codigo: (it.codigoReferencia || "").trim(),
      fonte: it.fonte,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      preco_unitario_edital: it.precoUnitarioEdital,
    }
    const ref = resolverReferencia(s, base)
    if (ref.tipo === "manual") {
      s.orfao = s.fonte !== "PROPRIA"
      s.custo_unitario_manual = it.precoUnitarioEdital != null ? truncar2(it.precoUnitarioEdital / fatorEdital) : 0
    }
    if (!grupos.has(nomeEtapa)) grupos.set(nomeEtapa, [])
    grupos.get(nomeEtapa)!.push(s)
  }

  const etapas: EtapaPlanilha[] = Array.from(grupos.entries()).map(([descricao, servicos], i) => ({
    id: uid(),
    item: String(i + 1),
    descricao,
    servicos,
  }))

  const meses = Math.max(1, Math.round(m.prazoExecucaoMeses ?? atual.cronograma.prazo_meses ?? 6))
  const agora = new Date().toISOString()
  return {
    ...atual,
    id: uid(),
    titulo: m.numeroEdital
      ? `${m.numeroEdital} — ${m.orgaoLicitante || "Licitação"}`
      : m.objetoObra?.slice(0, 70) || "Orçamento de Licitação (PDF)",
    origem: "pdf_licitacao",
    status: "em_revisao",
    criado_em: atual.criado_em || agora,
    modelo_base: {
      ...(atual.modelo_base || MODELO_BASE_PADRAO),
      num_proposta: m.numeroEdital || atual.modelo_base?.num_proposta || MODELO_BASE_PADRAO.num_proposta,
      endereco_obra: m.municipioUf || atual.modelo_base?.endereco_obra || MODELO_BASE_PADRAO.endereco_obra,
    },
    edital: {
      ...atual.edital,
      orgao: m.orgaoLicitante,
      numero_edital: m.numeroEdital,
      objeto: m.objetoObra,
      cliente: m.orgaoLicitante,
      municipio_uf: m.municipioUf,
      local: m.municipioUf.split("/")[0]?.trim() || atual.edital.local,
      bdi_referencia_edital: m.bdiReferenciaEdital,
    },
    desonerado: m.regimeDesonerado,
    ref_base_id: base.base_id,
    insumos_modificados: {},
    itens_planilha: etapas,
    cronograma: redimensionarCronograma({ prazo_meses: meses, distribuicao: {} }, etapas.map((e) => e.id), meses),
    exigencias_tecnicas: ai.resumoExigenciasTecnicas,
    atualizado_em: agora,
  }
}

/* ============================================================================
 * 11. FORMATAÇÃO
 * ========================================================================== */

export const fmtNum = (v: number, casas = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })

export const fmtBRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const fmtPct = (v: number, casas = 2) => `${fmtNum(v, casas)}%`

