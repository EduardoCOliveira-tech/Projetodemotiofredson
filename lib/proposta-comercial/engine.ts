// lib/proposta-comercial/engine.ts
// Motor de Cálculo Automático, Readequação de Disputa (TCU 2 casas decimais),
// Cronograma Físico-Financeiro e Integração com o SaaS (projetodemofredson).

import { valorExtenso } from "../valor-extenso"
import type { BaseReferencia, OrcamentoLicita, FonteItem } from "../proposal-types"
import { calcularOrcamento, criarOrcamentoVazio } from "../budget-engine"
import type { PerfilCliente } from "../client-storage"
import {
  PropostaComercialSchema,
  type PropostaComercial,
  type EtapaProposta,
  type ServicoProposta,
  type FonteReferencia,
} from "./schema"

/* ============================================================================
 * 1. UTILITÁRIOS DE ARREDONDAMENTO E FORMATAÇÃO MONETÁRIA (PADRÃO BRASILEIRO)
 * ========================================================================== */

const limparPontoFlutuante = (v: number) => Number(v.toFixed(8))

export function truncarMoeda2(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  return Math.trunc(limparPontoFlutuante(valor * 100)) / 100
}

export function arredondarMoeda2(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  const n = limparPontoFlutuante(valor * 100)
  return (Math.sign(n) * Math.round(Math.abs(n))) / 100
}

export function aplicarRegraMoeda(
  valor: number,
  modo: "truncar" | "arredondar" = "truncar",
): number {
  return modo === "truncar" ? truncarMoeda2(valor) : arredondarMoeda2(valor)
}

export function fmtMoedaBRL(valor: number): string {
  const v = Number.isFinite(valor) ? valor : 0
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fmtNumeroBR(valor: number, casas = 2): string {
  const v = Number.isFinite(valor) ? valor : 0
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function fmtPercentualBR(valor: number, casas = 2): string {
  return `${fmtNumeroBR(valor, casas)}%`
}

/* ============================================================================
 * 2. TIPOS DE RESULTADO DO MOTOR DE CÁLCULO
 * ========================================================================== */

export interface ItemCalculadoProposta {
  servico: ServicoProposta
  etapa_id: string
  item_hierarquia: string
  bdi_aplicado_pct: number
  custo_unitario_sem_bdi: number
  custo_total_sem_bdi: number
  preco_unitario_inicial: number
  total_inicial: number
  preco_unitario_com_bdi: number
  total_item: number
  desconto_aplicado_pct: number
}

export interface EtapaCalculadaProposta {
  etapa: EtapaProposta
  item_etapa: string
  itens: ItemCalculadoProposta[]
  subtotal_sem_bdi: number
  subtotal_inicial: number
  subtotal_com_bdi: number
  peso_percentual: number
}

export interface LinhaCronogramaCalculada {
  etapa_id: string
  item_etapa: string
  descricao: string
  valor_etapa: number
  peso_etapa_pct: number
  percentuais_periodo: number[]
  valores_periodo: number[]
  soma_percentual: number
}

export interface CronogramaCalculadoProposta {
  rotulo_periodo: string
  num_periodos: number
  linhas: LinhaCronogramaCalculada[]
  desembolso_periodo: number[]
  desembolso_acumulado: number[]
  avanco_fisico_periodo_pct: number[]
  avanco_fisico_acumulado_pct: number[]
}

export interface ResultadoPropostaComercial {
  etapas: EtapaCalculadaProposta[]
  qtd_etapas: number
  qtd_itens: number
  total_custo_sem_bdi: number
  total_bdi_rs: number
  valor_global_inicial: number
  valor_global_proposta: number
  valor_por_extenso: string
  desconto_linear_efetivo_pct: number
  economia_disputa_rs: number
  cronograma: CronogramaCalculadoProposta
}

/* ============================================================================
 * 3. MOTOR DE CÁLCULO EM TEMPO REAL DA PROPOSTA COMERCIAL
 * ========================================================================== */

export function calcularPropostaComercial(
  proposta: PropostaComercial,
): ResultadoPropostaComercial {
  const { orcamento, cronograma } = proposta
  const modo = orcamento.arredondamento || "truncar"
  const disputaAtiva = Boolean(orcamento.disputa?.aplicada)

  let somaCustoSemBdi = 0
  let somaGlobalInicial = 0
  let somaGlobalFinal = 0
  let contadorItens = 0

  const etapasParciais: Omit<EtapaCalculadaProposta, "peso_percentual">[] =
    orcamento.etapas.map((etapa, idxEtapa) => {
      const itemEtapa = `${idxEtapa + 1}`

      const itensCalculados: ItemCalculadoProposta[] = etapa.servicos.map(
        (s, idxServ) => {
          contadorItens += 1
          const itemHierarquia = `${itemEtapa}.${idxServ + 1}`
          const bdiPct =
            orcamento.usar_bdi_diferenciado && s.bdi_tipo === "diferenciado"
              ? orcamento.bdi_diferenciado_pct
              : orcamento.bdi_normal_pct

          const qtd = Math.max(0, Number(s.quantidade) || 0)
          const custoBase = Math.max(0, Number(s.custo_unitario) || 0)

          const puInicial = aplicarRegraMoeda(
            custoBase * (1 + bdiPct / 100),
            modo,
          )
          const totInicial = aplicarRegraMoeda(puInicial * qtd, modo)

          const puFinal =
            disputaAtiva && s.preco_readequado != null && s.preco_readequado >= 0
              ? aplicarRegraMoeda(s.preco_readequado, modo)
              : puInicial

          const custoSemBdiEfetivo =
            disputaAtiva && s.preco_readequado != null
              ? aplicarRegraMoeda(puFinal / (1 + bdiPct / 100), modo)
              : aplicarRegraMoeda(custoBase, modo)

          const custoTotalSemBdi = aplicarRegraMoeda(
            custoSemBdiEfetivo * qtd,
            modo,
          )
          const totFinal = aplicarRegraMoeda(puFinal * qtd, modo)

          const descontoPct =
            puInicial > 0
              ? arredondarMoeda2(((puInicial - puFinal) / puInicial) * 100)
              : 0

          return {
            servico: s,
            etapa_id: etapa.id,
            item_hierarquia: itemHierarquia,
            bdi_aplicado_pct: bdiPct,
            custo_unitario_sem_bdi: custoSemBdiEfetivo,
            custo_total_sem_bdi: custoTotalSemBdi,
            preco_unitario_inicial: puInicial,
            total_inicial: totInicial,
            preco_unitario_com_bdi: puFinal,
            total_item: totFinal,
            desconto_aplicado_pct: descontoPct,
          }
        },
      )

      const subtotalSemBdi = arredondarMoeda2(
        itensCalculados.reduce((acc, it) => acc + it.custo_total_sem_bdi, 0),
      )
      const subtotalInicial = arredondarMoeda2(
        itensCalculados.reduce((acc, it) => acc + it.total_inicial, 0),
      )
      const subtotalComBdi = arredondarMoeda2(
        itensCalculados.reduce((acc, it) => acc + it.total_item, 0),
      )

      somaCustoSemBdi = arredondarMoeda2(somaCustoSemBdi + subtotalSemBdi)
      somaGlobalInicial = arredondarMoeda2(somaGlobalInicial + subtotalInicial)
      somaGlobalFinal = arredondarMoeda2(somaGlobalFinal + subtotalComBdi)

      return {
        etapa,
        item_etapa: itemEtapa,
        itens: itensCalculados,
        subtotal_sem_bdi: subtotalSemBdi,
        subtotal_inicial: subtotalInicial,
        subtotal_com_bdi: subtotalComBdi,
      }
    })

  const etapas: EtapaCalculadaProposta[] = etapasParciais.map((et) => ({
    ...et,
    peso_percentual:
      somaGlobalFinal > 0
        ? arredondarMoeda2((et.subtotal_com_bdi / somaGlobalFinal) * 100)
        : 0,
  }))

  const totalBdiRs = Math.max(
    0,
    arredondarMoeda2(somaGlobalFinal - somaCustoSemBdi),
  )
  const economiaDisputaRs = Math.max(
    0,
    arredondarMoeda2(somaGlobalInicial - somaGlobalFinal),
  )
  const descontoLinearEfetivoPct =
    somaGlobalInicial > 0
      ? arredondarMoeda2(
          ((somaGlobalInicial - somaGlobalFinal) / somaGlobalInicial) * 100,
        )
      : 0

  // Cálculo do Cronograma Físico-Financeiro
  const numPeriodos = Math.max(1, Math.min(36, Math.floor(cronograma.num_periodos || 1)))
  const desembolsoPeriodo = Array(numPeriodos).fill(0)

  const linhasCronograma: LinhaCronogramaCalculada[] = etapas.map((et) => {
    const rawPct = cronograma.distribuicao[et.etapa.id] || []
    let percentuais: number[] = Array.from({ length: numPeriodos }, (_, i) => {
      const val = Number(rawPct[i])
      return Number.isFinite(val) && val >= 0 ? arredondarMoeda2(val) : 0
    })

    // Se a etapa ainda não tinha distribuição definida, distribui uniformemente em 100%
    if (rawPct.length === 0) {
      const base = truncarMoeda2(100 / numPeriodos)
      percentuais = Array(numPeriodos).fill(base)
      percentuais[numPeriodos - 1] = arredondarMoeda2(
        100 - base * (numPeriodos - 1),
      )
    }

    const somaPct = arredondarMoeda2(percentuais.reduce((a, b) => a + b, 0))
    const valores = percentuais.map((p) =>
      aplicarRegraMoeda((et.subtotal_com_bdi * p) / 100, modo),
    )

    // Ajuste de centavos no último período com percentual > 0 quando a etapa fecha 100%
    if (Math.abs(somaPct - 100) <= 0.05 && et.subtotal_com_bdi > 0) {
      let ultimoIndiceAtivo = numPeriodos - 1
      for (let i = numPeriodos - 1; i >= 0; i--) {
        if (percentuais[i] > 0) {
          ultimoIndiceAtivo = i
          break
        }
      }
      const somaExcetoUltimo = valores.reduce(
        (acc, v, idx) => (idx === ultimoIndiceAtivo ? acc : acc + v),
        0,
      )
      valores[ultimoIndiceAtivo] = arredondarMoeda2(
        et.subtotal_com_bdi - somaExcetoUltimo,
      )
    }

    valores.forEach((v, idx) => {
      desembolsoPeriodo[idx] = arredondarMoeda2(desembolsoPeriodo[idx] + v)
    })

    return {
      etapa_id: et.etapa.id,
      item_etapa: et.item_etapa,
      descricao: et.etapa.descricao,
      valor_etapa: et.subtotal_com_bdi,
      peso_etapa_pct: et.peso_percentual,
      percentuais_periodo: percentuais,
      valores_periodo: valores,
      soma_percentual: somaPct,
    }
  })

  const desembolsoAcumulado: number[] = []
  const avancoFisicoPeriodoPct: number[] = []
  const avancoFisicoAcumuladoPct: number[] = []

  desembolsoPeriodo.forEach((val, idx) => {
    const acum = arredondarMoeda2((desembolsoAcumulado[idx - 1] || 0) + val)
    desembolsoAcumulado.push(acum)
    avancoFisicoPeriodoPct.push(
      somaGlobalFinal > 0 ? arredondarMoeda2((val / somaGlobalFinal) * 100) : 0,
    )
    avancoFisicoAcumuladoPct.push(
      somaGlobalFinal > 0 ? arredondarMoeda2((acum / somaGlobalFinal) * 100) : 0,
    )
  })

  return {
    etapas,
    qtd_etapas: etapas.length,
    qtd_itens: contadorItens,
    total_custo_sem_bdi: somaCustoSemBdi,
    total_bdi_rs: totalBdiRs,
    valor_global_inicial: somaGlobalInicial,
    valor_global_proposta: somaGlobalFinal,
    valor_por_extenso: valorExtenso(somaGlobalFinal),
    desconto_linear_efetivo_pct: descontoLinearEfetivoPct,
    economia_disputa_rs: economiaDisputaRs,
    cronograma: {
      rotulo_periodo: cronograma.rotulo_periodo || "Mês",
      num_periodos: numPeriodos,
      linhas: linhasCronograma,
      desembolso_periodo: desembolsoPeriodo,
      desembolso_acumulado: desembolsoAcumulado,
      avanco_fisico_periodo_pct: avancoFisicoPeriodoPct,
      avanco_fisico_acumulado_pct: avancoFisicoAcumuladoPct,
    },
  }
}

/* ============================================================================
 * 4. SIMULADOR DE LANCE / READEQUAÇÃO PÓS-DISPUTA (FECHAMENTO EXATO TCU)
 * ========================================================================== */

/**
 * Recalcula todos os preços unitários da planilha aplicando o desconto linear
 * sem gerar dízimas (truncamento ou arredondamento em 2 casas decimais) e
 * realiza o ajuste fino de centavos nos preços unitários elegíveis para que a
 * soma global dos itens feche com o valor do lance vencedor.
 */
export function aplicarReadequacaoDisputa(
  proposta: PropostaComercial,
  parametros: {
    modo: "valor" | "percentual"
    valor_arrematado?: number | null
    desconto_pct?: number | null
  },
): {
  proposta: PropostaComercial
  valorInicial: number
  valorAlvo: number
  valorObtido: number
  residuo: number
  descontoEfetivoPct: number
} {
  // Calcula primeiro sem disputa ativa para obter o valor global inicial exato
  const estadoSemDisputa: PropostaComercial = {
    ...proposta,
    orcamento: {
      ...proposta.orcamento,
      disputa: { ...proposta.orcamento.disputa, aplicada: false },
    },
  }
  const calcInicial = calcularPropostaComercial(estadoSemDisputa)
  const valorInicial = calcInicial.valor_global_inicial
  const modoArr = proposta.orcamento.arredondamento || "truncar"

  let valorAlvo = valorInicial
  let descontoInformadoPct = 0

  if (parametros.modo === "valor") {
    valorAlvo = Math.max(
      0,
      arredondarMoeda2(Number(parametros.valor_arrematado) || 0),
    )
    descontoInformadoPct =
      valorInicial > 0
        ? arredondarMoeda2(((valorInicial - valorAlvo) / valorInicial) * 100)
        : 0
  } else {
    descontoInformadoPct = Math.max(
      0,
      Math.min(99.99, Number(parametros.desconto_pct) || 0),
    )
    valorAlvo = aplicarRegraMoeda(
      valorInicial * (1 - descontoInformadoPct / 100),
      modoArr,
    )
  }

  const fator = valorInicial > 0 ? valorAlvo / valorInicial : 1

  // Estrutura linearizada de itens para cálculo e reconciliação de centavos
  interface ItemTrabalho {
    etapaIdx: number
    servIdx: number
    qtd: number
    puInicial: number
    puNovo: number
    totalNovo: number
  }

  const listaItens: ItemTrabalho[] = []

  proposta.orcamento.etapas.forEach((et, eIdx) => {
    et.servicos.forEach((s, sIdx) => {
      const bdiPct =
        proposta.orcamento.usar_bdi_diferenciado &&
        s.bdi_tipo === "diferenciado"
          ? proposta.orcamento.bdi_diferenciado_pct
          : proposta.orcamento.bdi_normal_pct
      const qtd = Math.max(0, Number(s.quantidade) || 0)
      const puInicial = aplicarRegraMoeda(
        (Number(s.custo_unitario) || 0) * (1 + bdiPct / 100),
        modoArr,
      )
      const puNovo = Math.max(0.01, aplicarRegraMoeda(puInicial * fator, modoArr))
      const totalNovo = aplicarRegraMoeda(puNovo * qtd, modoArr)

      listaItens.push({
        etapaIdx: eIdx,
        servIdx: sIdx,
        qtd,
        puInicial,
        puNovo,
        totalNovo,
      })
    })
  })

  // Reconciliação de centavos nos preços unitários (sem dízimas, mantendo 2 casas decimais)
  let somaAtual = arredondarMoeda2(
    listaItens.reduce((acc, it) => acc + it.totalNovo, 0),
  )
  let diffCentavos = Math.round((valorAlvo - somaAtual) * 100)

  // Ordena candidatos com menor quantidade inteira positiva (ex.: qtd=1 ajusta exatamente 1 centavo)
  const candidatos = [...listaItens]
    .filter((it) => it.qtd > 0)
    .sort((a, b) => {
      const aInt = Number.isInteger(a.qtd) ? 0 : 1
      const bInt = Number.isInteger(b.qtd) ? 0 : 1
      if (aInt !== bInt) return aInt - bInt
      if (a.qtd !== b.qtd) return a.qtd - b.qtd
      return b.totalNovo - a.totalNovo
    })

  let iteracoes = 0
  while (diffCentavos !== 0 && iteracoes < 500) {
    iteracoes += 1
    const sinal = diffCentavos > 0 ? 1 : -1
    let ajustouNestaRodada = false

    for (const cand of candidatos) {
      const novoPu = arredondarMoeda2(cand.puNovo + sinal * 0.01)
      if (novoPu <= 0) continue
      // Respeita o teto do preço unitário inicial quando for desconto
      if (valorAlvo <= valorInicial && novoPu > cand.puInicial) continue

      const novoTotal = aplicarRegraMoeda(novoPu * cand.qtd, modoArr)
      const impactoCentavos = Math.round((novoTotal - cand.totalNovo) * 100)

      if (
        impactoCentavos !== 0 &&
        Math.sign(impactoCentavos) === sinal &&
        Math.abs(impactoCentavos) <= Math.abs(diffCentavos)
      ) {
        cand.puNovo = novoPu
        cand.totalNovo = novoTotal
        diffCentavos -= impactoCentavos
        ajustouNestaRodada = true
        if (diffCentavos === 0) break
      }
    }

    if (!ajustouNestaRodada) break
  }

  const mapaReadequado = new Map<string, number>()
  listaItens.forEach((it) => {
    mapaReadequado.set(`${it.etapaIdx}:${it.servIdx}`, it.puNovo)
  })

  const etapasAtualizadas: EtapaProposta[] = proposta.orcamento.etapas.map(
    (et, eIdx) => ({
      ...et,
      servicos: et.servicos.map((s, sIdx) => ({
        ...s,
        preco_readequado:
          mapaReadequado.get(`${eIdx}:${sIdx}`) ?? s.preco_readequado,
      })),
    }),
  )

  const valorObtido = arredondarMoeda2(
    listaItens.reduce((acc, it) => acc + it.totalNovo, 0),
  )
  const residuo = arredondarMoeda2(valorAlvo - valorObtido)
  const descontoEfetivoPct =
    valorInicial > 0
      ? arredondarMoeda2(((valorInicial - valorObtido) / valorInicial) * 100)
      : 0

  const novaProposta: PropostaComercial = {
    ...proposta,
    atualizado_em: new Date().toISOString(),
    certame: {
      ...proposta.certame,
      tipo_proposta: "readequada",
    },
    orcamento: {
      ...proposta.orcamento,
      etapas: etapasAtualizadas,
      disputa: {
        modo: parametros.modo,
        valor_arrematado: valorAlvo,
        desconto_pct: descontoInformadoPct,
        aplicada: true,
        valor_referencia: valorInicial,
        valor_alvo: valorAlvo,
        residuo,
        aplicada_em: new Date().toISOString(),
      },
    },
  }

  return {
    proposta: novaProposta,
    valorInicial,
    valorAlvo,
    valorObtido,
    residuo,
    descontoEfetivoPct,
  }
}

export function limparReadequacaoDisputa(
  proposta: PropostaComercial,
): PropostaComercial {
  return {
    ...proposta,
    atualizado_em: new Date().toISOString(),
    orcamento: {
      ...proposta.orcamento,
      etapas: proposta.orcamento.etapas.map((et) => ({
        ...et,
        servicos: et.servicos.map((s) => ({
          ...s,
          preco_readequado: null,
        })),
      })),
      disputa: {
        ...proposta.orcamento.disputa,
        aplicada: false,
        residuo: 0,
        aplicada_em: null,
      },
    },
  }
}

/* ============================================================================
 * 5. INTEGRAÇÃO E CONVERSÃO BIDIRECIONAL COM O SAAS (PROJETODEMOFREDSON)
 * ========================================================================== */

const STORAGE_PROPOSTAS_KEY = "licitasaas_propostas_comerciais_v1"

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

function mapearFonteParaProposta(fonte: FonteItem): FonteReferencia {
  if (fonte === "SINAPI") return "SINAPI"
  if (fonte === "GOINFRA") return "GOINFRA"
  return "PROPRIO"
}

function mapearFonteParaOrcamentoSaaS(fonte: FonteReferencia): FonteItem {
  if (fonte === "SINAPI") return "SINAPI"
  if (fonte === "GOINFRA") return "GOINFRA"
  return "PROPRIA"
}

/**
 * Converte um documento de licitação (`OrcamentoLicita`) do SaaS para a
 * estrutura rica de `PropostaComercial` do Módulo Construtor.
 */
export function converterOrcamentoSaaSParaProposta(
  orcamento: OrcamentoLicita,
  base: BaseReferencia,
  perfil?: PerfilCliente | null,
): PropostaComercial {
  // Verifica se já existe uma PropostaComercial salva vinculada a este orcamento.id
  const existente = obterPropostaPorLicitacaoId(orcamento.id)
  if (existente) {
    return existente
  }

  const calc = calcularOrcamento(orcamento, base)
  const bdiCalculado = calc.bdi.bdi_percentual || orcamento.edital.bdi_referencia_edital || 24.18
  const hoje = new Date().toISOString().slice(0, 10)

  const etapasConvertidas: EtapaProposta[] = calc.etapas.map((et) => ({
    id: et.etapa.id || uid(),
    descricao: et.etapa.descricao || "Etapa de Serviços",
    servicos: et.servicos.map((rs) => ({
      id: rs.servico.id || uid(),
      codigo: rs.servico.codigo || "COMP-01",
      fonte: mapearFonteParaProposta(rs.servico.fonte),
      descricao: rs.servico.descricao || "Serviço de Engenharia",
      unidade: rs.servico.unidade || "un",
      quantidade: rs.servico.quantidade || 1,
      custo_unitario: rs.custo_unitario > 0 ? rs.custo_unitario : 100,
      bdi_tipo: "normal",
      preco_readequado: null,
    })),
  }))

  const prazoMeses = Math.max(1, orcamento.cronograma?.prazo_meses || 3)

  const propostaBruta = {
    schema_version: 1 as const,
    id: `prop-${orcamento.id}`,
    licitacao_id: orcamento.id,
    status: orcamento.status === "finalizado" ? ("finalizada" as const) : ("rascunho" as const),
    criado_em: orcamento.criado_em || new Date().toISOString(),
    atualizado_em: new Date().toISOString(),

    certame: {
      orgao: orcamento.edital.orgao || "PREFEITURA MUNICIPAL / ÓRGÃO LICITANTE",
      agente_contratacao:
        orcamento.modelo_base?.aos_cuidados ||
        "Agente de Contratação / Comissão Permanente de Licitação",
      modalidade: "Concorrência Eletrônica",
      numero_edital: orcamento.edital.numero_edital || "Concorrência Eletrônica nº 012/2026",
      numero_processo: "Processo Administrativo nº 2026.000123",
      uasg: "989001",
      portal: "Compras.gov.br",
      data_sessao: `${orcamento.edital.data_proposta || hoje}T09:00`,
      municipio_uf: orcamento.edital.municipio_uf || perfil?.cidade_uf || "Goiânia/GO",
      objeto:
        orcamento.edital.objeto ||
        "Contratação de empresa especializada em engenharia para execução de obra pública conforme especificações do Edital e Projeto Básico.",
      tipo_proposta: "inicial" as const,
      numero_proposta:
        orcamento.modelo_base?.num_proposta || `PROP-${new Date().getFullYear()}-001`,
    },

    proponente: {
      razao_social:
        orcamento.edital.empresa_licitante ||
        perfil?.empresa ||
        "CONSTRUTORA E ENGENHARIA MODELO LTDA",
      cnpj: orcamento.edital.cnpj_licitante || perfil?.cnpj || "12.345.678/0001-90",
      inscricao_estadual: "10.987.654-3",
      inscricao_municipal: "458920-1",
      endereco:
        orcamento.modelo_base?.endereco_obra ||
        "Av. República do Líbano, nº 1.500, Sala 804, Setor Oeste",
      cep: "74115-030",
      cidade_uf: perfil?.cidade_uf || orcamento.edital.municipio_uf || "Goiânia/GO",
      telefone: orcamento.modelo_base?.telefone_contato || perfil?.telefone || "(62) 3200-1000",
      email: perfil?.email || "licitacoes@construtoramodelo.com.br",
      banco: {
        banco: "001 — Banco do Brasil S.A.",
        agencia: "1234-5",
        conta: "98765-4",
        pix: orcamento.edital.cnpj_licitante || perfil?.cnpj || "12.345.678/0001-90",
      },
      representante: {
        nome: perfil?.nome || "Roberto Almeida Prado",
        cpf: "456.789.123-00",
        cargo: perfil?.cargo || "Sócio-Administrador / Representante Legal",
      },
      responsavel_tecnico: {
        nome:
          orcamento.edital.responsavel_tecnico ||
          perfil?.responsavel_tecnico ||
          "Eng. Carlos Eduardo Silva",
        titulo: "Engenheiro Civil",
        conselho: "CREA" as const,
        registro:
          orcamento.edital.registro_profissional ||
          perfil?.registro_profissional ||
          "102030/D",
        uf: "GO",
      },
    },

    orcamento: {
      bdi_normal_pct: bdiCalculado,
      usar_bdi_diferenciado: false,
      bdi_diferenciado_pct: 14.0,
      encargos_horista_pct: orcamento.desonerado ? 84.12 : 114.23,
      encargos_mensalista_pct: orcamento.desonerado ? 48.06 : 70.85,
      desonerado: Boolean(orcamento.desonerado),
      data_base: orcamento.ref_base_id || "SINAPI-GO 05/2026",
      arredondamento:
        orcamento.arredondamento === "arredondar_2_casas"
          ? ("arredondar" as const)
          : ("truncar" as const),
      etapas: etapasConvertidas,
      disputa: {
        modo: "valor" as const,
        valor_arrematado: null,
        desconto_pct: 5,
        aplicada: false,
        valor_referencia: null,
        valor_alvo: null,
        residuo: 0,
        aplicada_em: null,
      },
    },

    cronograma: {
      rotulo_periodo: "Mês" as const,
      num_periodos: prazoMeses,
      distribuicao: orcamento.cronograma?.distribuicao || {},
    },

    condicoes: {
      validade_dias: orcamento.edital.validade_dias || 60,
      prazo_execucao: prazoMeses * 30,
      prazo_execucao_unidade: "dias" as const,
      prazo_garantia_anos: 5,
      condicoes_pagamento:
        orcamento.modelo_base?.condicoes_pagamento ||
        "Pagamento mediante medições mensais dos serviços efetivamente executados, atestadas pela fiscalização do órgão contratante, em até 30 (trinta) dias após a emissão da Nota Fiscal, conforme Lei Federal nº 14.133/2021.",
      declaracoes: {
        custos_inclusos: true,
        elaboracao_independente: true,
        reserva_cargos_pcd: true,
        conhecimento_local: true,
        nao_emprega_menor: true,
      },
      observacoes_html: (orcamento.modelo_base?.observacoes || []).length
        ? `<ul>${(orcamento.modelo_base?.observacoes || []).map((o) => `<li>${o}</li>`).join("")}</ul>`
        : "<p>Proposta elaborada em estrita conformidade com o Edital, Termo de Referência, Memorial Descritivo e Projetos Básicos/Executivos integrantes do certame.</p>",
    },

    identidade: {
      logo_data_url: null,
      cor_primaria: "#334155",
      local: orcamento.edital.local || orcamento.edital.municipio_uf || "Goiânia/GO",
      data_automatica: true,
      data_documento: orcamento.edital.data_proposta || hoje,
      assinatura_modo: "digital" as const,
      assinatura_representante_url: null,
      assinatura_responsavel_url: null,
    },
  }

  return PropostaComercialSchema.parse(propostaBruta)
}

/**
 * Converte a `PropostaComercial` de volta para o formato `OrcamentoLicita`
 * para manter a listagem CRUD do Perfil do Cliente sempre sincronizada.
 */
export function sincronizarPropostaParaOrcamentoSaaS(
  proposta: PropostaComercial,
  orcamentoAnterior?: OrcamentoLicita,
): OrcamentoLicita {
  const base = orcamentoAnterior || criarOrcamentoVazio()
  const resultado = calcularPropostaComercial(proposta)

  return {
    ...base,
    id: proposta.licitacao_id || base.id,
    titulo: `${proposta.certame.tipo_proposta === "readequada" ? "[Readequada] " : ""}${proposta.certame.numero_edital || proposta.certame.numero_proposta} — ${proposta.certame.orgao}`,
    status: proposta.status === "finalizada" ? "finalizado" : "rascunho",
    atualizado_em: new Date().toISOString(),
    desonerado: proposta.orcamento.desonerado,
    arredondamento:
      proposta.orcamento.arredondamento === "arredondar"
        ? "arredondar_2_casas"
        : "truncar_2_casas",
    edital: {
      ...base.edital,
      orgao: proposta.certame.orgao,
      cliente: proposta.certame.orgao,
      numero_edital: proposta.certame.numero_edital,
      objeto: proposta.certame.objeto,
      municipio_uf: proposta.certame.municipio_uf,
      local: proposta.identidade.local || proposta.certame.municipio_uf,
      data_proposta:
        proposta.identidade.data_documento ||
        new Date().toISOString().slice(0, 10),
      validade_dias: proposta.condicoes.validade_dias,
      empresa_licitante: proposta.proponente.razao_social,
      cnpj_licitante: proposta.proponente.cnpj,
      responsavel_tecnico: proposta.proponente.responsavel_tecnico.nome,
      registro_profissional: `${proposta.proponente.responsavel_tecnico.conselho}-${proposta.proponente.responsavel_tecnico.uf} ${proposta.proponente.responsavel_tecnico.registro}`,
      bdi_referencia_edital: proposta.orcamento.bdi_normal_pct,
    },
    modelo_base: {
      num_proposta: proposta.certame.numero_proposta,
      aos_cuidados: proposta.certame.agente_contratacao,
      telefone_contato: proposta.proponente.telefone,
      endereco_obra: proposta.proponente.endereco,
      introducao_texto:
        base.modelo_base?.introducao_texto ||
        "Apresentamos nossa Proposta Comercial para execução dos serviços objeto deste certame, em conformidade com a Lei Federal nº 14.133/2021.",
      metodologia_tecnica:
        base.modelo_base?.metodologia_tecnica ||
        "Os serviços serão executados rigorosamente conforme projetos, memoriais descritivos e normas técnicas da ABNT.",
      condicoes_pagamento: proposta.condicoes.condicoes_pagamento,
      observacoes: base.modelo_base?.observacoes || [],
      exibir_bdi_proposta: true,
      exibir_cronograma_proposta: true,
    },
    itens_planilha: resultado.etapas.map((et) => ({
      id: et.etapa.id,
      item: et.item_etapa,
      descricao: et.etapa.descricao,
      servicos: et.itens.map((it) => ({
        id: it.servico.id,
        item: it.item_hierarquia,
        codigo: it.servico.codigo,
        fonte: mapearFonteParaOrcamentoSaaS(it.servico.fonte),
        descricao: it.servico.descricao,
        unidade: it.servico.unidade,
        quantidade: it.servico.quantidade,
        preco_unitario_edital: it.preco_unitario_inicial,
        custo_unitario_manual: it.custo_unitario_sem_bdi,
        orfao: it.servico.fonte === "PROPRIO",
      })),
    })),
    cronograma: {
      prazo_meses: proposta.cronograma.num_periodos,
      distribuicao: proposta.cronograma.distribuicao,
    },
  }
}

export function listarPropostasSalvas(): Record<string, PropostaComercial> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_PROPOSTAS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function obterPropostaPorLicitacaoId(
  licitacaoId: string,
): PropostaComercial | null {
  const mapa = listarPropostasSalvas()
  const item = mapa[licitacaoId]
  if (!item) return null
  const validado = PropostaComercialSchema.safeParse(item)
  return validado.success ? validado.data : null
}

export function salvarPropostaNoSaaS(
  proposta: PropostaComercial,
): PropostaComercial {
  const atualizada: PropostaComercial = {
    ...proposta,
    atualizado_em: new Date().toISOString(),
  }
  if (typeof window !== "undefined") {
    const chave = atualizada.licitacao_id || atualizada.id
    try {
      const mapa = listarPropostasSalvas()
      mapa[chave] = atualizada
      window.localStorage.setItem(STORAGE_PROPOSTAS_KEY, JSON.stringify(mapa))
    } catch {
      try {
        // Caso o localStorage atinja o limite de 5 MB, mantém apenas a proposta ativa
        window.localStorage.setItem(
          STORAGE_PROPOSTAS_KEY,
          JSON.stringify({ [chave]: atualizada }),
        )
      } catch {
        try {
          // Último fallback sem imagens Base64 pesadas para jamais travar a aplicação
          const compacta: PropostaComercial = {
            ...atualizada,
            identidade: {
              ...atualizada.identidade,
              logo_data_url: null,
              assinatura_representante_url: null,
              assinatura_responsavel_url: null,
            },
          }
          window.localStorage.setItem(
            STORAGE_PROPOSTAS_KEY,
            JSON.stringify({ [chave]: compacta }),
          )
        } catch {
          // Ignora silenciosamente se o armazenamento do navegador estiver bloqueado
        }
      }
    }
  }
  return atualizada
}

