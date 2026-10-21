// lib/proposal-types.ts
// Tipagens e Schemas do Sistema de Orçamentação e Propostas de Licitações (SINAPI / GOINFRA)
import { z } from "zod"

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Implementação completa (até trilhões) centralizada em ./valor-extenso
export { valorExtenso } from "./valor-extenso"

export function formatDate(dateStr: string): string {
  if (!dateStr) return "..."
  const [ano, mes, dia] = dateStr.split("-")
  return `${dia}/${mes}/${ano}`
}

/* ============================================================================
 * DOMÍNIO LICITAÇÕES — Orçamentação de Obras Públicas (SINAPI / GOINFRA)
 * ============================================================================ */

export type FonteBase = "SINAPI" | "GOINFRA"
export type FonteItem = FonteBase | "PROPRIA"
export type TipoInsumo = "Material" | "MaoDeObra" | "Equipamento"
export type ModoArredondamento = "truncar_2_casas" | "arredondar_2_casas"

/**
 * Insumo de uma base oficial mensal.
 * `id` é a chave global no dicionário em memória: `${fonte}:${codigo}`.
 * `preco_base_desonerado` é opcional: a SINAPI publica preços distintos para
 * os regimes com/sem desoneração da folha (encargos sociais diferentes).
 */
export interface InsumoBase {
  id: string
  codigo: string
  fonte: FonteBase
  descricao: string
  unidade: string
  preco_base: number
  preco_base_desonerado?: number
  tipo: TipoInsumo
}

export interface ItemComposicaoInsumo {
  id_insumo: string
  coeficiente: number
}

export interface ItemComposicaoAuxiliar {
  id_composicao: string
  coeficiente: number
}

/** Composição de Custo Unitário (CPU) — analítico da base oficial. */
export interface ComposicaoCPU {
  id: string
  codigo: string
  fonte: FonteBase
  descricao: string
  unidade: string
  insumos: ItemComposicaoInsumo[]
  composicoes_auxiliares: ItemComposicaoAuxiliar[]
  /** Custo sintético oficial publicado (usado para auditoria). */
  custo_referencia?: number
  custo_referencia_desonerado?: number
}

/** Deságio aplicado a um insumo (chave = id do insumo). */
export interface InsumoModificado {
  modo: "percentual" | "valor_fixo"
  desconto_percentual: number
  novo_preco: number
  justificativa?: string
}

/**
 * Parâmetros do BDI em PERCENTUAL (ex.: 4.5 = 4,5%).
 * Fórmula Acórdão 2.622/2013-TCU:
 * BDI = (((1 + AC + S + R + G) * (1 + DF) * (1 + L)) / (1 - I)) - 1
 */
export interface ConfigBDI {
  ac: number      // Administração Central
  s: number       // Seguros
  r: number       // Riscos
  g: number       // Garantias
  df: number      // Despesas Financeiras
  lucro: number   // Lucro (L)
  pis: number
  cofins: number
  iss: number
  /** Alíquota da CPRB aplicada automaticamente quando `desonerado = true`. */
  cprb: number
}

export interface DadosEdital {
  orgao: string
  numero_edital: string
  objeto: string
  cliente: string
  municipio_uf: string
  data_proposta: string        // ISO yyyy-mm-dd
  local: string
  validade_dias: number
  responsavel_tecnico: string
  registro_profissional: string
  empresa_licitante: string
  cnpj_licitante: string
  bdi_referencia_edital: number | null   // % do BDI do edital (quando informado)
}

export interface ServicoPlanilha {
  id: string
  item: string                 // hierarquia: "1.1", "1.2.3"...
  codigo: string
  fonte: FonteItem
  descricao: string
  unidade: string
  quantidade: number
  /** Preço unitário COM BDI publicado no edital — atua como teto. */
  preco_unitario_edital: number | null
  /** Custo direto unitário manual (itens PROPRIA ou órfãos). */
  custo_unitario_manual?: number
  /** Marcado quando o código não existe na base de referência ativa. */
  orfao?: boolean
}

export interface EtapaPlanilha {
  id: string
  item: string                 // "1", "2", ...
  descricao: string
  servicos: ServicoPlanilha[]
}

export interface ConfigCronograma {
  prazo_meses: number
  /** Percentual (0–100) executado por mês, por etapa: { [etapaId]: [m1, m2, ...] } */
  distribuicao: Record<string, number[]>
}

export type OrigemDocumento = "zero" | "pdf_licitacao"
export type StatusDocumento = "rascunho" | "em_revisao" | "finalizado"

export interface ModeloBaseConfig {
  num_proposta: string
  aos_cuidados: string
  telefone_contato: string
  endereco_obra: string
  introducao_texto: string
  metodologia_tecnica: string
  condicoes_pagamento: string
  observacoes: string[]
  exibir_bdi_proposta: boolean
  exibir_cronograma_proposta: boolean
}

export interface OrcamentoLicita {
  id: string
  titulo?: string
  origem?: OrigemDocumento
  status?: StatusDocumento
  arquivo_origem_pdf?: string
  criado_em?: string
  modelo_base?: ModeloBaseConfig
  edital: DadosEdital
  bdi: ConfigBDI
  desonerado: boolean
  ref_base_id: string | null
  insumos_modificados: Record<string, InsumoModificado>
  itens_planilha: EtapaPlanilha[]
  arredondamento: ModoArredondamento
  cronograma: ConfigCronograma
  exigencias_tecnicas: string[]
  atualizado_em: string
}

/** Dicionário em memória com as entidades da base oficial já hidratadas. */
export interface BaseReferencia {
  base_id: string | null
  insumos: Record<string, InsumoBase>
  composicoes: Record<string, ComposicaoCPU>
}

/** Metadados de uma planilha mensal importada (`catalogo_bases/{base_id}`). */
export interface CatalogoBase {
  id: string                   // ex.: "SINAPI-GO-2026-05"
  orgao: FonteBase
  uf: string
  mes_ano: string              // "2026-05"
  descricao: string
  total_insumos: number
  total_composicoes: number
  possui_desonerado: boolean
  possui_nao_desonerado: boolean
  criado_em: string
}

export interface ParametrosGerais {
  base_padrao_sinapi?: string
  base_padrao_goinfra?: string
}

export const chaveEntidade = (fonte: FonteBase, codigo: string) =>
  `${fonte}:${String(codigo).trim()}`

/* ----------------------------------------------------------------------------
 * Schema Zod — retorno estruturado da IA (leitura de Edital / Planilha Base)
 * -------------------------------------------------------------------------- */

export const MetadadosEditalSchema = z.object({
  orgaoLicitante: z.string().describe("Nome do órgão/entidade licitante"),
  numeroEdital: z.string().describe("Número do edital/processo, ex.: 'Concorrência 012/2026'"),
  objetoObra: z.string().describe("Descrição do objeto da licitação"),
  municipioUf: z.string().describe("Município e UF da obra, ex.: 'Anápolis/GO'"),
  prazoExecucaoMeses: z.number().nullable().describe("Prazo de execução em meses; null se não informado"),
  bdiReferenciaEdital: z
    .number()
    .nullable()
    .describe("BDI de referência do edital em percentual (ex.: 24.18); null se ausente"),
  regimeDesonerado: z.boolean().describe("true se a planilha base usa preços desonerados da folha"),
  bancoSugerido: z.object({
    orgao: z.enum(["SINAPI", "GOINFRA"]),
    uf: z.string().describe("UF de referência, 2 letras"),
    mesAno: z.string().describe("Data-base no formato YYYY-MM"),
  }),
})

export const ItemExtraidoSchema = z.object({
  itemHierarquia: z.string().describe("Numeração hierárquica do item, ex.: '2.3.1'"),
  codigoReferencia: z.string().describe("Código do serviço na base (somente o código, sem prefixos)"),
  fonte: z.enum(["SINAPI", "GOINFRA", "PROPRIA"]),
  descricao: z.string(),
  unidade: z.string(),
  quantidade: z.number(),
  precoUnitarioEdital: z
    .number()
    .nullable()
    .describe("Preço unitário com BDI na planilha do edital; null se ausente"),
  etapaSugerida: z.string().describe("Título da etapa/grupo ao qual o item pertence"),
})

export const AiEditalResponseSchema = z.object({
  metadados: MetadadosEditalSchema,
  itensExtraidos: z.array(ItemExtraidoSchema),
  resumoExigenciasTecnicas: z
    .array(z.string())
    .describe("Exigências de qualificação técnica (atestados, parcelas de maior relevância, CAT etc.)"),
})

export type MetadadosEdital = z.infer<typeof MetadadosEditalSchema>
export type ItemExtraido = z.infer<typeof ItemExtraidoSchema>
export type AiEditalResponse = z.infer<typeof AiEditalResponseSchema>