// lib/proposta-comercial/schema.ts
// Modelo de dados (JSON) da Proposta Comercial de Licitação de Engenharia.
// O schema Zod é a fonte única da verdade: valida rascunhos carregados do
// armazenamento/banco e gera os tipos TypeScript usados em todo o módulo.
// Estrutura pronta para persistência vinculada ao ID da licitação no SaaS.

import { z } from "zod"

/* ============================================================================
 * LISTAS DE DOMÍNIO (Lei nº 14.133/2021)
 * ========================================================================== */

export const FONTES_REFERENCIA = ["SINAPI", "SICRO", "ORSE", "GOINFRA", "SEINFRA", "PROPRIO"] as const
export type FonteReferencia = (typeof FONTES_REFERENCIA)[number]

export const ROTULO_FONTE: Record<FonteReferencia, string> = {
  SINAPI: "SINAPI",
  SICRO: "SICRO",
  ORSE: "ORSE",
  GOINFRA: "GOINFRA",
  SEINFRA: "SEINFRA",
  PROPRIO: "Próprio",
}

export const MODALIDADES = [
  "Concorrência Eletrônica",
  "Concorrência Presencial",
  "Pregão Eletrônico",
  "Pregão Presencial",
  "Diálogo Competitivo",
  "Dispensa Eletrônica",
  "Dispensa de Licitação",
  "Inexigibilidade",
  "Credenciamento",
] as const

export const PORTAIS = [
  "Compras.gov.br",
  "PNCP — Portal Nacional de Contratações Públicas",
  "Licitações-e (Banco do Brasil)",
  "BLL Compras",
  "Licitanet",
  "Portal de Compras Públicas",
  "BNC — Bolsa Nacional de Compras",
  "Portal próprio do órgão",
] as const

export const UNIDADES_MEDIDA = ["m", "m²", "m³", "un", "vb", "kg", "t", "h", "mês", "cj", "pç", "l", "km", "t·km", "m³·km", "dia"] as const

export const TITULOS_PROFISSIONAIS = [
  "Engenheiro Civil",
  "Engenheira Civil",
  "Arquiteto e Urbanista",
  "Arquiteta e Urbanista",
  "Engenheiro Eletricista",
  "Engenheiro Mecânico",
  "Engenheiro Sanitarista e Ambiental",
  "Engenheiro de Segurança do Trabalho",
] as const

export const ROTULOS_PERIODO = ["Mês", "Quinzena", "Semana", "Período de 30 dias"] as const

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

/* ============================================================================
 * SCHEMAS
 * ========================================================================== */

const texto = (padrao = "") => z.string().default(padrao)
const numero = (padrao = 0) => z.number().finite().default(padrao)

export const ServicoPropostaSchema = z.object({
  id: z.string(),
  codigo: texto(),
  fonte: z.enum(FONTES_REFERENCIA).default("SINAPI"),
  descricao: texto(),
  unidade: texto("un"),
  quantidade: numero(),
  /** Custo unitário direto, SEM BDI (R$). */
  custo_unitario: numero(),
  /** BDI aplicável: normal (serviços) ou diferenciado (fornecimento de materiais/equipamentos). */
  bdi_tipo: z.enum(["normal", "diferenciado"]).default("normal"),
  /** Preço unitário COM BDI definido pela readequação pós-disputa (null = usa o preço original). */
  preco_readequado: z.number().finite().nullable().default(null),
})

export const EtapaPropostaSchema = z.object({
  id: z.string(),
  descricao: texto(),
  servicos: z.array(ServicoPropostaSchema).default([]),
})

export const DisputaSchema = z.object({
  modo: z.enum(["valor", "percentual"]).default("valor"),
  /** Valor global arrematado na fase de lances (R$). */
  valor_arrematado: z.number().finite().nullable().default(null),
  /** Percentual de desconto linear sobre a proposta inicial (%). */
  desconto_pct: z.number().finite().nullable().default(null),
  aplicada: z.boolean().default(false),
  /** Valor global da proposta inicial no momento da readequação (R$). */
  valor_referencia: z.number().finite().nullable().default(null),
  /** Valor-alvo exato utilizado na readequação (R$). */
  valor_alvo: z.number().finite().nullable().default(null),
  /** Diferença residual (R$) que não pôde ser absorvida pelo ajuste de centavos. */
  residuo: z.number().finite().default(0),
  aplicada_em: z.string().nullable().default(null),
})

export const PropostaComercialSchema = z.object({
  schema_version: z.literal(1).default(1),
  id: z.string(),
  /** ID da licitação/orçamento cadastrado no SaaS ao qual a proposta está vinculada. */
  licitacao_id: z.string().nullable().default(null),
  status: z.enum(["rascunho", "finalizada"]).default("rascunho"),
  criado_em: z.string(),
  atualizado_em: z.string(),

  certame: z.object({
    orgao: texto(),
    agente_contratacao: texto("Agente de Contratação / Comissão de Contratação"),
    modalidade: texto("Concorrência Eletrônica"),
    numero_edital: texto(),
    numero_processo: texto(),
    uasg: texto(),
    portal: texto("Compras.gov.br"),
    /** Formato datetime-local: yyyy-mm-ddThh:mm */
    data_sessao: texto(),
    municipio_uf: texto(),
    objeto: texto(),
    tipo_proposta: z.enum(["inicial", "readequada"]).default("inicial"),
    numero_proposta: texto(),
  }),

  proponente: z.object({
    razao_social: texto(),
    cnpj: texto(),
    inscricao_estadual: texto(),
    inscricao_municipal: texto(),
    endereco: texto(),
    cep: texto(),
    cidade_uf: texto(),
    telefone: texto(),
    email: texto(),
    banco: z.object({
      banco: texto(),
      agencia: texto(),
      conta: texto(),
      pix: texto(),
    }),
    representante: z.object({
      nome: texto(),
      cpf: texto(),
      cargo: texto("Sócio-Administrador"),
    }),
    responsavel_tecnico: z.object({
      nome: texto(),
      titulo: texto("Engenheiro Civil"),
      conselho: z.enum(["CREA", "CAU", "CFT"]).default("CREA"),
      registro: texto(),
      uf: texto("GO"),
    }),
  }),

  orcamento: z.object({
    bdi_normal_pct: numero(24),
    usar_bdi_diferenciado: z.boolean().default(false),
    bdi_diferenciado_pct: numero(14),
    encargos_horista_pct: numero(114.23),
    encargos_mensalista_pct: numero(70.85),
    desonerado: z.boolean().default(false),
    /** Referência de preços, ex.: "SINAPI-GO 05/2026". */
    data_base: texto(),
    arredondamento: z.enum(["truncar", "arredondar"]).default("truncar"),
    etapas: z.array(EtapaPropostaSchema).default([]),
    disputa: DisputaSchema,
  }),

  cronograma: z.object({
    rotulo_periodo: z.enum(ROTULOS_PERIODO).default("Mês"),
    num_periodos: z.number().int().min(1).max(36).default(3),
    /** Percentual físico (0–100) por período, por etapa: { [etapaId]: [p1, p2, ...] } */
    distribuicao: z.record(z.array(z.number().finite())).default({}),
  }),

  condicoes: z.object({
    validade_dias: z.number().int().min(1).default(60),
    prazo_execucao: z.number().int().min(0).default(90),
    prazo_execucao_unidade: z.enum(["dias", "meses"]).default("dias"),
    prazo_garantia_anos: z.number().int().min(0).default(5),
    condicoes_pagamento: texto(
      "Pagamento mediante medições mensais dos serviços efetivamente executados, atestadas pela fiscalização, conforme cronograma físico-financeiro e condições estabelecidas no edital e na minuta do contrato.",
    ),
    declaracoes: z.object({
      custos_inclusos: z.boolean().default(true),
      elaboracao_independente: z.boolean().default(true),
      reserva_cargos_pcd: z.boolean().default(true),
      conhecimento_local: z.boolean().default(true),
      nao_emprega_menor: z.boolean().default(false),
    }),
    /** HTML sanitizado (apenas p, br, strong, em, u, ul, ol, li). */
    observacoes_html: texto(),
  }),

  identidade: z.object({
    logo_data_url: z.string().nullable().default(null),
    cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#334155"),
    local: texto(),
    data_automatica: z.boolean().default(true),
    /** yyyy-mm-dd — usado quando data_automatica = false */
    data_documento: texto(),
    assinatura_modo: z.enum(["manuscrita", "imagem", "digital"]).default("manuscrita"),
    assinatura_representante_url: z.string().nullable().default(null),
    assinatura_responsavel_url: z.string().nullable().default(null),
  }),
})

export type PropostaComercial = z.infer<typeof PropostaComercialSchema>
export type ServicoProposta = z.infer<typeof ServicoPropostaSchema>
export type EtapaProposta = z.infer<typeof EtapaPropostaSchema>
export type DisputaConfig = z.infer<typeof DisputaSchema>
export type ChaveDeclaracao = keyof PropostaComercial["condicoes"]["declaracoes"]

