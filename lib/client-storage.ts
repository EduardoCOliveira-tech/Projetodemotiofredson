// lib/client-storage.ts
// Camada de persistência de Autenticação, Perfil do Cliente e CRUD de Documentos
// do Sistema de Licitações e Orçamentação de Obras Públicas (SINAPI / GOINFRA).

import type {
  AiEditalResponse,
  BaseReferencia,
  OrcamentoLicita,
  OrigemDocumento,
  StatusDocumento,
} from "./proposal-types"
import {
  MODELO_BASE_PADRAO,
  criarOrcamentoVazio,
  montarOrcamentoDeEdital,
  redimensionarCronograma,
} from "./budget-engine"
import { BASE_DEMO, EDITAL_DEMO } from "./demo-data"

export interface PerfilCliente {
  id: string
  nome: string
  email: string
  cargo: string
  empresa: string
  cnpj: string
  telefone: string
  responsavel_tecnico: string
  registro_profissional: string
  cidade_uf: string
  criado_em: string
}

const STORAGE_USER_KEY = "licitasaas_user_v2"
const STORAGE_USERS_DB_KEY = "licitasaas_users_db_v2"
const STORAGE_DOCS_KEY = "licitasaas_docs_v2"
const STORAGE_ACTIVE_DOC_KEY = "licitasaas_active_doc_id_v2"

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const PERFIL_PADRAO_DEMO: PerfilCliente = {
  id: "usr-licitante-01",
  nome: "Engenheiro Orçamentista",
  email: "orcamento@construtoramodelo.com.br",
  cargo: "Diretor de Licitações & Orçamentos",
  empresa: "CONSTRUTORA E ENGENHARIA MODELO LTDA",
  cnpj: "12.345.678/0001-90",
  telefone: "(62) 3200-1000",
  responsavel_tecnico: "Eng. Carlos Eduardo Silva",
  registro_profissional: "CREA-GO 102030/D",
  cidade_uf: "Goiânia/GO",
  criado_em: "2026-01-10T10:00:00.000Z",
}

/* ============================================================================
 * 1. AUTENTICAÇÃO E PERFIL DO CLIENTE
 * ========================================================================== */

export function obterPerfilLogado(): PerfilCliente | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PerfilCliente
  } catch {
    return null
  }
}

export function salvarPerfilLogado(perfil: PerfilCliente): PerfilCliente {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(perfil))
  }
  return perfil
}

export function realizarLoginCliente(email: string, senha?: string): PerfilCliente {
  if (typeof window === "undefined") return PERFIL_PADRAO_DEMO
  const emailLimpo = email.trim().toLowerCase()
  try {
    const rawDb = window.localStorage.getItem(STORAGE_USERS_DB_KEY)
    const db: Record<string, PerfilCliente & { senha?: string }> = rawDb ? JSON.parse(rawDb) : {}
    if (db[emailLimpo]) {
      const { senha: _, ...perfilSalvo } = db[emailLimpo]
      return salvarPerfilLogado(perfilSalvo)
    }
  } catch {
    // fallback
  }

  const nomeExtraido = emailLimpo.split("@")[0] || "Orçamentista"
  const nomeFormatado =
    nomeExtraido === "orcamento"
      ? PERFIL_PADRAO_DEMO.nome
      : nomeExtraido.charAt(0).toUpperCase() + nomeExtraido.slice(1)

  const perfil: PerfilCliente = {
    ...PERFIL_PADRAO_DEMO,
    id: `usr-${uid().slice(0, 8)}`,
    nome: nomeFormatado,
    email: emailLimpo || PERFIL_PADRAO_DEMO.email,
  }
  return salvarPerfilLogado(perfil)
}

export function cadastrarNovoCliente(
  dados: Partial<PerfilCliente> & { email: string; nome: string; senha?: string }
): PerfilCliente {
  const emailLimpo = dados.email.trim().toLowerCase()
  const novoPerfil: PerfilCliente = {
    id: `usr-${uid().slice(0, 8)}`,
    nome: dados.nome.trim() || "Cliente Licitante",
    email: emailLimpo,
    cargo: dados.cargo?.trim() || "Engenheiro Orçamentista",
    empresa: dados.empresa?.trim() || PERFIL_PADRAO_DEMO.empresa,
    cnpj: dados.cnpj?.trim() || PERFIL_PADRAO_DEMO.cnpj,
    telefone: dados.telefone?.trim() || PERFIL_PADRAO_DEMO.telefone,
    responsavel_tecnico: dados.responsavel_tecnico?.trim() || dados.nome.trim(),
    registro_profissional: dados.registro_profissional?.trim() || PERFIL_PADRAO_DEMO.registro_profissional,
    cidade_uf: dados.cidade_uf?.trim() || PERFIL_PADRAO_DEMO.cidade_uf,
    criado_em: new Date().toISOString(),
  }

  if (typeof window !== "undefined") {
    try {
      const rawDb = window.localStorage.getItem(STORAGE_USERS_DB_KEY)
      const db = rawDb ? JSON.parse(rawDb) : {}
      db[emailLimpo] = { ...novoPerfil, senha: dados.senha }
      window.localStorage.setItem(STORAGE_USERS_DB_KEY, JSON.stringify(db))
    } catch {
      // ignore quota errors
    }
  }

  return salvarPerfilLogado(novoPerfil)
}

export function realizarLogoutCliente(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_USER_KEY)
  }
}

/* ============================================================================
 * 2. DOCUMENTOS INICIAIS DO CLIENTE (EXEMPLOS DE LICITAÇÃO)
 * ========================================================================== */

function construirDocumentosIniciais(perfil: PerfilCliente = PERFIL_PADRAO_DEMO): OrcamentoLicita[] {
  // Documento 1: Pré-gerado a partir de PDF de Licitação (SINAPI)
  const baseVazia = criarOrcamentoVazio()
  const docLicitacao = montarOrcamentoDeEdital(EDITAL_DEMO, BASE_DEMO, baseVazia)
  docLicitacao.id = "doc-licitacao-ubs-012"
  docLicitacao.titulo = "Concorrência Eletrônica nº 012/2026 — Construção de UBS Porte I"
  docLicitacao.origem = "pdf_licitacao"
  docLicitacao.status = "em_revisao"
  docLicitacao.arquivo_origem_pdf = "Edital_Concorrencia_012_2026_UBS_Porte_I.pdf"
  docLicitacao.criado_em = "2026-10-12T14:20:00.000Z"
  docLicitacao.atualizado_em = "2026-10-15T16:45:00.000Z"
  docLicitacao.edital.empresa_licitante = perfil.empresa
  docLicitacao.edital.cnpj_licitante = perfil.cnpj
  docLicitacao.edital.responsavel_tecnico = perfil.responsavel_tecnico
  docLicitacao.edital.registro_profissional = perfil.registro_profissional

  // Documento 2: Iniciado do Zero seguindo o Modelo Base de Licitação (SINAPI)
  const etapaEsc1 = "etapa-esc-1"
  const etapaEsc2 = "etapa-esc-2"
  const docEscola: OrcamentoLicita = {
    ...criarOrcamentoVazio(),
    id: "doc-reforma-escola-008",
    titulo: "Tomada de Preços nº 008/2026 — Reforma e Ampliação de Escola Municipal",
    origem: "zero",
    status: "finalizado",
    criado_em: "2026-10-08T09:15:00.000Z",
    atualizado_em: "2026-10-14T11:30:00.000Z",
    modelo_base: {
      ...MODELO_BASE_PADRAO,
      num_proposta: "TP-008/2026",
      aos_cuidados: "Comissão Permanente de Contratação",
      telefone_contato: perfil.telefone,
      endereco_obra: "Setor Central — Goiânia/GO",
      observacoes: [...MODELO_BASE_PADRAO.observacoes],
    },
    edital: {
      orgao: "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
      numero_edital: "Tomada de Preços nº 008/2026",
      objeto:
        "Reforma geral, fechamento em alvenaria e reforço de fundações em concreto armado da Escola Municipal Modelo.",
      cliente: "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
      municipio_uf: "Goiânia/GO",
      data_proposta: "2026-10-14",
      local: "Goiânia/GO",
      validade_dias: 60,
      responsavel_tecnico: perfil.responsavel_tecnico,
      registro_profissional: perfil.registro_profissional,
      empresa_licitante: perfil.empresa,
      cnpj_licitante: perfil.cnpj,
      bdi_referencia_edital: 22.12,
    },
    itens_planilha: [
      {
        id: etapaEsc1,
        item: "1",
        descricao: "INFRAESTRUTURA E FUNDAÇÕES",
        servicos: [
          {
            id: "srv-esc-1",
            item: "1.1",
            codigo: "D9006",
            fonte: "SINAPI",
            descricao: "ESCAVAÇÃO MANUAL DE VALA COM PROFUNDIDADE ATÉ 1,5 M",
            unidade: "M3",
            quantidade: 30,
            preco_unitario_edital: 105.0,
          },
          {
            id: "srv-esc-2",
            item: "1.2",
            codigo: "D9003",
            fonte: "SINAPI",
            descricao: "FABRICAÇÃO, MONTAGEM E DESMONTAGEM DE FÔRMA PARA FUNDAÇÃO EM TÁBUA",
            unidade: "M2",
            quantidade: 45,
            preco_unitario_edital: 110.0,
          },
          {
            id: "srv-esc-3",
            item: "1.3",
            codigo: "D9001",
            fonte: "SINAPI",
            descricao: "CONCRETO FCK = 25 MPA, PREPARO MECÂNICO COM BETONEIRA 400 L",
            unidade: "M3",
            quantidade: 14,
            preco_unitario_edital: 760.0,
          },
        ],
      },
      {
        id: etapaEsc2,
        item: "2",
        descricao: "SUPERESTRUTURA E VEDAÇÃO",
        servicos: [
          {
            id: "srv-esc-4",
            item: "2.1",
            codigo: "D9002",
            fonte: "SINAPI",
            descricao: "ARMAÇÃO DE ESTRUTURAS COM AÇO CA-50 DE 10,0 MM - MONTAGEM",
            unidade: "KG",
            quantidade: 850,
            preco_unitario_edital: 15.1,
          },
          {
            id: "srv-esc-5",
            item: "2.2",
            codigo: "D9004",
            fonte: "SINAPI",
            descricao: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS 9X19X19 CM, E = 9 CM",
            unidade: "M2",
            quantidade: 210,
            preco_unitario_edital: 95.0,
          },
        ],
      },
    ],
    cronograma: redimensionarCronograma(
      { prazo_meses: 3, distribuicao: {} },
      [etapaEsc1, etapaEsc2],
      3
    ),
    exigencias_tecnicas: [
      "Certidão de Registro e Quitação da empresa e do responsável técnico no CREA/CAU.",
      "Comprovação de aptidão técnica em execução de obras civis públicas.",
    ],
  }

  return [docLicitacao, docEscola]
}

/* ============================================================================
 * 3. OPERAÇÕES CRUD DE DOCUMENTOS DO CLIENTE
 * ========================================================================== */

export function listarDocumentosCliente(): OrcamentoLicita[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_DOCS_KEY)
    if (!raw) {
      const perfil = obterPerfilLogado() || PERFIL_PADRAO_DEMO
      const iniciais = construirDocumentosIniciais(perfil)
      window.localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(iniciais))
      return iniciais
    }
    const lista = JSON.parse(raw) as OrcamentoLicita[]
    return lista.sort((a, b) => (b.atualizado_em || "").localeCompare(a.atualizado_em || ""))
  } catch {
    return []
  }
}

function gravarListaDocumentos(docs: OrcamentoLicita[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_DOCS_KEY, JSON.stringify(docs))
  }
}

export function obterDocumentoPorId(id: string): OrcamentoLicita | null {
  const docs = listarDocumentosCliente()
  return docs.find((d) => d.id === id) || null
}

export function definirDocumentoAtivoId(id: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_ACTIVE_DOC_KEY, id)
  }
}

export function obterDocumentoAtivoId(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(STORAGE_ACTIVE_DOC_KEY)
}

export function salvarDocumentoCliente(orcamento: OrcamentoLicita): OrcamentoLicita {
  const docs = listarDocumentosCliente()
  const atualizado: OrcamentoLicita = {
    ...orcamento,
    modelo_base: orcamento.modelo_base || { ...MODELO_BASE_PADRAO },
    atualizado_em: new Date().toISOString(),
  }
  const idx = docs.findIndex((d) => d.id === atualizado.id)
  if (idx >= 0) {
    docs[idx] = atualizado
  } else {
    docs.unshift(atualizado)
  }
  gravarListaDocumentos(docs)
  definirDocumentoAtivoId(atualizado.id)
  return atualizado
}

export type ModeloInicialZero = "em_branco" | "obra_publica"

export interface OpcoesCriarDoZero {
  titulo?: string
  orgaoCliente?: string
  numeroProposta?: string
  objeto?: string
  municipioUf?: string
  modeloInicial?: ModeloInicialZero
}

export function criarNovoDocumentoDoZero(opcoes: OpcoesCriarDoZero = {}): OrcamentoLicita {
  const perfil = obterPerfilLogado() || PERFIL_PADRAO_DEMO
  const novo = criarOrcamentoVazio()
  const agora = new Date().toISOString()
  const numProp = opcoes.numeroProposta?.trim() || `EDITAL-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`

  novo.id = `doc-${uid()}`
  novo.titulo = opcoes.titulo?.trim() || "Novo Orçamento Iniciado do Zero"
  novo.origem = "zero"
  novo.status = "rascunho"
  novo.criado_em = agora
  novo.atualizado_em = agora

  novo.edital = {
    ...novo.edital,
    orgao: opcoes.orgaoCliente?.trim() || "",
    cliente: opcoes.orgaoCliente?.trim() || "",
    numero_edital: numProp,
    objeto: opcoes.objeto?.trim() || "",
    municipio_uf: opcoes.municipioUf?.trim() || perfil.cidade_uf || "Goiânia/GO",
    local: (opcoes.municipioUf || perfil.cidade_uf || "Goiânia/GO").split("/")[0]?.trim() || "Goiânia",
    empresa_licitante: perfil.empresa,
    cnpj_licitante: perfil.cnpj,
    responsavel_tecnico: perfil.responsavel_tecnico,
    registro_profissional: perfil.registro_profissional,
  }

  novo.modelo_base = {
    ...MODELO_BASE_PADRAO,
    num_proposta: numProp,
    telefone_contato: perfil.telefone,
    endereco_obra: opcoes.municipioUf?.trim() || perfil.cidade_uf || "Local da Obra",
    observacoes: [...MODELO_BASE_PADRAO.observacoes],
  }

  const preset = opcoes.modeloInicial || "em_branco"

  if (preset === "obra_publica") {
    const e1 = `et-${uid()}-1`
    const e2 = `et-${uid()}-2`
    const e3 = `et-${uid()}-3`
    novo.itens_planilha = [
      {
        id: e1,
        item: "1",
        descricao: "SERVIÇOS PRELIMINARES",
        servicos: [
          {
            id: `srv-${uid()}-1`,
            item: "1.1",
            codigo: "D9006",
            fonte: "SINAPI",
            descricao: "ESCAVAÇÃO MANUAL DE VALA COM PROFUNDIDADE ATÉ 1,5 M",
            unidade: "M3",
            quantidade: 20,
            preco_unitario_edital: 105.0,
          },
        ],
      },
      {
        id: e2,
        item: "2",
        descricao: "INFRAESTRUTURA E FUNDAÇÕES",
        servicos: [
          {
            id: `srv-${uid()}-2`,
            item: "2.1",
            codigo: "D9001",
            fonte: "SINAPI",
            descricao: "CONCRETO FCK = 25 MPA, PREPARO MECÂNICO COM BETONEIRA 400 L",
            unidade: "M3",
            quantidade: 10,
            preco_unitario_edital: 760.0,
          },
        ],
      },
      {
        id: e3,
        item: "3",
        descricao: "ALVENARIA E VEDAÇÃO",
        servicos: [
          {
            id: `srv-${uid()}-3`,
            item: "3.1",
            codigo: "D9004",
            fonte: "SINAPI",
            descricao: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS 9X19X19 CM, E = 9 CM",
            unidade: "M2",
            quantidade: 120,
            preco_unitario_edital: 95.0,
          },
        ],
      },
    ]
    novo.cronograma = redimensionarCronograma({ prazo_meses: 4, distribuicao: {} }, [e1, e2, e3], 4)
  } else {
    // 100% do zero com 1 etapa inicial limpa pronta para receber itens
    const etapaId = `et-${uid()}`
    novo.itens_planilha = [
      {
        id: etapaId,
        item: "1",
        descricao: "SERVIÇOS PRELIMINARES",
        servicos: [],
      },
    ]
    novo.cronograma = redimensionarCronograma({ prazo_meses: 4, distribuicao: {} }, [etapaId], 4)
  }

  return salvarDocumentoCliente(novo)
}

export function criarDocumentoAPartirDeEditalPDF(
  aiData: AiEditalResponse,
  nomeArquivoPdf: string,
  base: BaseReferencia = BASE_DEMO,
  tituloPersonalizado?: string
): OrcamentoLicita {
  const perfil = obterPerfilLogado() || PERFIL_PADRAO_DEMO
  const rascunhoBase = criarOrcamentoVazio()
  rascunhoBase.edital.empresa_licitante = perfil.empresa
  rascunhoBase.edital.cnpj_licitante = perfil.cnpj
  rascunhoBase.edital.responsavel_tecnico = perfil.responsavel_tecnico
  rascunhoBase.edital.registro_profissional = perfil.registro_profissional

  const orc = montarOrcamentoDeEdital(aiData, base, rascunhoBase)
  orc.id = `doc-${uid()}`
  orc.origem = "pdf_licitacao"
  orc.status = "em_revisao"
  orc.arquivo_origem_pdf = nomeArquivoPdf
  orc.titulo =
    tituloPersonalizado?.trim() ||
    (aiData.metadados.numeroEdital
      ? `${aiData.metadados.numeroEdital} — ${aiData.metadados.orgaoLicitante || "Licitação"}`
      : `Licitação (${nomeArquivoPdf.replace(/\.pdf$/i, "")})`)
  orc.edital.empresa_licitante = perfil.empresa
  orc.edital.cnpj_licitante = perfil.cnpj
  orc.edital.responsavel_tecnico = perfil.responsavel_tecnico
  orc.edital.registro_profissional = perfil.registro_profissional

  return salvarDocumentoCliente(orc)
}

/**
 * Fallback inteligente quando a API Gemini não está configurada no ambiente local:
 * gera a estrutura do edital a partir dos metadados do arquivo PDF enviado.
 */
export function gerarFallbackEditalDePDF(file: File): AiEditalResponse {
  const nomeSemExt = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim()
  return {
    ...EDITAL_DEMO,
    metadados: {
      ...EDITAL_DEMO.metadados,
      numeroEdital: EDITAL_DEMO.metadados.numeroEdital,
      objetoObra: `Licitação extraída do arquivo "${nomeSemExt}" — Execução de Obras e Serviços de Engenharia conforme Memorial e Planilha Base.`,
    },
  }
}

export function atualizarMetadadosDocumento(
  id: string,
  patch: {
    titulo?: string
    orgao?: string
    cliente?: string
    numero_edital?: string
    objeto?: string
    status?: StatusDocumento
    origem?: OrigemDocumento
  }
): OrcamentoLicita | null {
  const docAtual = obterDocumentoPorId(id)
  if (!docAtual) return null

  const atualizado: OrcamentoLicita = {
    ...docAtual,
    titulo: patch.titulo !== undefined ? patch.titulo : docAtual.titulo,
    status: patch.status !== undefined ? patch.status : docAtual.status,
    origem: patch.origem !== undefined ? patch.origem : docAtual.origem,
    edital: {
      ...docAtual.edital,
      orgao: patch.orgao !== undefined ? patch.orgao : docAtual.edital.orgao,
      cliente: patch.cliente !== undefined ? patch.cliente : patch.orgao !== undefined ? patch.orgao : docAtual.edital.cliente,
      numero_edital: patch.numero_edital !== undefined ? patch.numero_edital : docAtual.edital.numero_edital,
      objeto: patch.objeto !== undefined ? patch.objeto : docAtual.edital.objeto,
    },
    atualizado_em: new Date().toISOString(),
  }

  return salvarDocumentoCliente(atualizado)
}

export function duplicarDocumentoCliente(id: string): OrcamentoLicita | null {
  const original = obterDocumentoPorId(id)
  if (!original) return null
  const agora = new Date().toISOString()
  const copia: OrcamentoLicita = JSON.parse(JSON.stringify(original))
  copia.id = `doc-${uid()}`
  copia.titulo = `${original.titulo || "Documento"} (Cópia)`
  copia.status = "rascunho"
  copia.criado_em = agora
  copia.atualizado_em = agora
  return salvarDocumentoCliente(copia)
}

export function excluirDocumentoCliente(id: string): OrcamentoLicita[] {
  const docs = listarDocumentosCliente().filter((d) => d.id !== id)
  gravarListaDocumentos(docs)
  return docs
}

export function restaurarDocumentosExemplo(): OrcamentoLicita[] {
  const perfil = obterPerfilLogado() || PERFIL_PADRAO_DEMO
  const iniciais = construirDocumentosIniciais(perfil)
  gravarListaDocumentos(iniciais)
  return iniciais
}
