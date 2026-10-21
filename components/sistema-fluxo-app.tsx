"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import { EditorSidebar } from "@/components/editor-sidebar"
import { BudgetTable } from "@/components/budget-table"
import { ScheduleTable } from "@/components/schedule-table"
import { DocumentPreview } from "@/components/document-preview"
import { ZoomControls } from "@/components/zoom-controls"
import { PropostaConstrutorModulo } from "@/components/proposta-construtor-modulo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import {
  ArrowRight,
  ArrowLeft,
  FilePlus2,
  FileUp,
  FolderOpen,
  FileText,
  Calculator,
  Calendar,
  CheckCircle2,
  LogIn,
  UserCheck,
  Sparkles,
  Layers,
  ShieldCheck,
  Building2,
  Lock,
  Mail,
  User,
  Search,
  Pencil,
  Copy,
  Trash2,
  ExternalLink,
  LogOut,
  Clock,
  RefreshCw,
  Home,
  RotateCcw,
  Download,
  AlertTriangle,
  Save
} from "lucide-react"

import type {
  OrcamentoLicita,
  BaseReferencia,
  CatalogoBase,
  AiEditalResponse,
  StatusDocumento
} from "@/lib/proposal-types"
import {
  calcularOrcamento,
  criarOrcamentoVazio,
  montarOrcamentoDeEdital,
  fmtBRL,
  fmtPct
} from "@/lib/budget-engine"
import { BASE_DEMO, EDITAL_DEMO } from "@/lib/demo-data"
import {
  listarCatalogoBases,
  executarMigracaoBase
} from "@/lib/firebase-bases"
import { firebaseConfigurado } from "@/lib/firebase"
import {
  type PerfilCliente,
  type ModeloInicialZero,
  PERFIL_PADRAO_DEMO,
  obterPerfilLogado,
  salvarPerfilLogado,
  realizarLoginCliente,
  cadastrarNovoCliente,
  realizarLogoutCliente,
  listarDocumentosCliente,
  obterDocumentoPorId,
  obterDocumentoAtivoId,
  definirDocumentoAtivoId,
  salvarDocumentoCliente,
  criarNovoDocumentoDoZero,
  criarDocumentoAPartirDeEditalPDF,
  gerarFallbackEditalDePDF,
  atualizarMetadadosDocumento,
  duplicarDocumentoCliente,
  excluirDocumentoCliente,
  restaurarDocumentosExemplo
} from "@/lib/client-storage"
import { toast } from "sonner"

export type EtapaFluxo = "homepage" | "login" | "perfil" | "editor"

interface SistemaFluxoAppProps {
  initialStage?: EtapaFluxo
}

export function SistemaFluxoApp({ initialStage = "homepage" }: SistemaFluxoAppProps) {
  const [etapa, setEtapa] = useState<EtapaFluxo>(initialStage)
  const [perfil, setPerfil] = useState<PerfilCliente | null>(null)
  const [documentos, setDocumentos] = useState<OrcamentoLicita[]>([])

  // Estado do Editor (Etapa 4)
  const [orcamento, setOrcamento] = useState<OrcamentoLicita>(() =>
    montarOrcamentoDeEdital(EDITAL_DEMO, BASE_DEMO, criarOrcamentoVazio())
  )
  const [baseReferencia, setBaseReferencia] = useState<BaseReferencia>(BASE_DEMO)
  const [catalogoBases, setCatalogoBases] = useState<CatalogoBase[]>([
    {
      id: "DEMO-SINAPI-GO-2026-05",
      orgao: "SINAPI",
      uf: "GO",
      mes_ano: "2026-05",
      descricao: "SINAPI GO — 05/2026 (Base Demo Local)",
      total_insumos: 13,
      total_composicoes: 6,
      possui_desonerado: true,
      possui_nao_desonerado: true,
      criado_em: new Date().toISOString()
    }
  ])
  const [modoEditor, setModoEditor] = useState<"construtor_a4" | "cpu_analitico">("construtor_a4")
  const [viewMode, setViewMode] = useState<"planilha" | "cronograma" | "preview">("planilha")
  const [zoom, setZoom] = useState(1)
  const [isProcessingAI, setIsProcessingAI] = useState(false)
  const [ultimoSalvoEm, setUltimoSalvoEm] = useState<string>("")

  // Estados da Etapa 2 (Login / Cadastro)
  const [abaLogin, setAbaLogin] = useState<"login" | "cadastro">("login")
  const [loginEmail, setLoginEmail] = useState("orcamento@licitasaas.com.br")
  const [loginSenha, setLoginSenha] = useState("123456")
  const [cadNome, setCadNome] = useState("")
  const [cadEmail, setCadEmail] = useState("")
  const [cadSenha, setCadSenha] = useState("")
  const [cadEmpresa, setCadEmpresa] = useState("CONSTRUTORA E ENGENHARIA MODELO LTDA")
  const [cadCnpj, setCadCnpj] = useState("12.345.678/0001-90")
  const [cadRespTecnico, setCadRespTecnico] = useState("Eng. Civil Responsável")
  const [cadCrea, setCadCrea] = useState("CREA-GO 102030/D")
  const [cadCidadeUf, setCadCidadeUf] = useState("Goiânia/GO")

  // Estados da Etapa 3 (Perfil + CRUD + Iniciar do 0 ou PDF)
  const pdfInputPerfilRef = useRef<HTMLInputElement>(null)
  const [buscaDocs, setBuscaDocs] = useState("")
  const [filtroOrigem, setFiltroOrigem] = useState<"todos" | "zero" | "pdf_licitacao">("todos")
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusDocumento>("todos")
  const [processandoPdfPerfil, setProcessandoPdfPerfil] = useState(false)

  // Modal: Iniciar Documento do 0
  const [modalZeroOpen, setModalZeroOpen] = useState(false)
  const [zeroTitulo, setZeroTitulo] = useState("")
  const [zeroOrgao, setZeroOrgao] = useState("")
  const [zeroNumProposta, setZeroNumProposta] = useState(`PROP-${new Date().getFullYear()}-001`)
  const [zeroMunicipioUf, setZeroMunicipioUf] = useState("Goiânia/GO")
  const [zeroObjeto, setZeroObjeto] = useState("")
  const [zeroModeloInicial, setZeroModeloInicial] = useState<ModeloInicialZero>("em_branco")

  // Modal: Editar Metadados Rápidos (Update CRUD no Perfil)
  const [modalEditarDocOpen, setModalEditarDocOpen] = useState(false)
  const [docEditando, setDocEditando] = useState<OrcamentoLicita | null>(null)
  const [editTitulo, setEditTitulo] = useState("")
  const [editOrgao, setEditOrgao] = useState("")
  const [editNumEdital, setEditNumEdital] = useState("")
  const [editObjeto, setEditObjeto] = useState("")
  const [editStatus, setEditStatus] = useState<StatusDocumento>("rascunho")

  // Modal: Confirmar Exclusão (Delete CRUD)
  const [modalExcluirOpen, setModalExcluirOpen] = useState(false)
  const [docParaExcluir, setDocParaExcluir] = useState<OrcamentoLicita | null>(null)

  // Modal: Editar Dados do Perfil / Empresa
  const [modalPerfilOpen, setModalPerfilOpen] = useState(false)
  const [perfNome, setPerfNome] = useState("")
  const [perfCargo, setPerfCargo] = useState("")
  const [perfEmpresa, setPerfEmpresa] = useState("")
  const [perfCnpj, setPerfCnpj] = useState("")
  const [perfTelefone, setPerfTelefone] = useState("")
  const [perfRespTecnico, setPerfRespTecnico] = useState("")
  const [perfRegistro, setPerfRegistro] = useState("")
  const [perfCidadeUf, setPerfCidadeUf] = useState("")

  // Navegação segura entre as 4 etapas com sincronização de hash no navegador
  const navegarPara = (novaEtapa: EtapaFluxo, docId?: string) => {
    if (docId) {
      const encontrado = obterDocumentoPorId(docId)
      if (encontrado) {
        setOrcamento(encontrado)
        definirDocumentoAtivoId(docId)
        setUltimoSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
      }
    }
    if (novaEtapa === "perfil") {
      setDocumentos(listarDocumentosCliente())
      const atual = obterPerfilLogado() || salvarPerfilLogado(PERFIL_PADRAO_DEMO)
      setPerfil(atual)
    }
    setEtapa(novaEtapa)
    if (typeof window !== "undefined") {
      const hashAlvo = novaEtapa === "homepage" ? "" : `#${novaEtapa}`
      if (window.location.hash !== hashAlvo) {
        window.history.pushState(null, "", hashAlvo || window.location.pathname)
      }
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  // Inicialização no cliente e suporte ao botão Voltar/Avançar do navegador
  useEffect(() => {
    const logado = obterPerfilLogado()
    if (logado) {
      setPerfil(logado)
      setLoginEmail(logado.email)
      setZeroMunicipioUf(logado.cidade_uf || "Goiânia/GO")
    }
    const lista = listarDocumentosCliente()
    setDocumentos(lista)

    const idAtivo = obterDocumentoAtivoId() || lista[0]?.id
    if (idAtivo) {
      const docAtivo = obterDocumentoPorId(idAtivo)
      if (docAtivo) setOrcamento(docAtivo)
    }

    // Verifica hash na URL caso o usuário tenha atualizado a página em #login, #perfil ou #editor
    const lerHash = () => {
      const h = window.location.hash.replace("#", "").toLowerCase()
      if (h === "login" || h === "perfil" || h === "editor" || h === "homepage") {
        setEtapa(h as EtapaFluxo)
        if (h === "perfil") setDocumentos(listarDocumentosCliente())
      } else if (initialStage !== "homepage") {
        setEtapa(initialStage)
      }
    }
    lerHash()

    const onPopState = () => {
      const h = window.location.hash.replace("#", "").toLowerCase()
      if (h === "login" || h === "perfil" || h === "editor") {
        setEtapa(h as EtapaFluxo)
      } else {
        setEtapa("homepage")
      }
    }
    window.addEventListener("popstate", onPopState)
    window.addEventListener("hashchange", onPopState)
    return () => {
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("hashchange", onPopState)
    }
  }, [initialStage])

  // Carregar catálogo do Firestore se configurado
  useEffect(() => {
    if (firebaseConfigurado) {
      listarCatalogoBases()
        .then((bases) => {
          if (bases.length > 0) {
            setCatalogoBases((prev) => [...bases, ...prev])
          }
        })
        .catch((err) => console.warn("Firestore não acessível no momento:", err))
    }
  }, [])

  // Motor Reativo de Cálculo do Orçamento Ativo
  const resultado = useMemo(() => {
    return calcularOrcamento(orcamento, baseReferencia)
  }, [orcamento, baseReferencia])

  /* ============================================================================
   * HANDLERS DA ETAPA 2: LOGIN E CADASTRO
   * ========================================================================== */

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail.trim()) {
      toast.error("Informe seu e-mail para entrar.")
      return
    }
    const p = realizarLoginCliente(loginEmail, loginSenha)
    setPerfil(p)
    setDocumentos(listarDocumentosCliente())
    toast.success(`Bem-vindo(a), ${p.nome}!`)
    navegarPara("perfil")
  }

  const handleCadastroSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cadNome.trim() || !cadEmail.trim()) {
      toast.error("Preencha seu nome e e-mail para criar a conta.")
      return
    }
    const novo = cadastrarNovoCliente({
      nome: cadNome,
      email: cadEmail,
      senha: cadSenha,
      empresa: cadEmpresa,
      cnpj: cadCnpj,
      responsavel_tecnico: cadRespTecnico,
      registro_profissional: cadCrea,
      cidade_uf: cadCidadeUf
    })
    setPerfil(novo)
    setDocumentos(listarDocumentosCliente())
    toast.success(`Perfil criado com sucesso para ${novo.nome}!`)
    navegarPara("perfil")
  }

  const handleLoginDemo = () => {
    const p = realizarLoginCliente(PERFIL_PADRAO_DEMO.email)
    setPerfil(p)
    setDocumentos(listarDocumentosCliente())
    toast.success(`Conectado como ${p.nome} (${p.empresa})!`)
    navegarPara("perfil")
  }

  /* ============================================================================
   * HANDLERS DA ETAPA 3: PERFIL (DO ZERO, PDF DE LICITAÇÃO E CRUD)
   * ========================================================================== */

  const perfilAtivo = perfil || PERFIL_PADRAO_DEMO

  const abrirModalCriarDoZero = () => {
    const proxNumero = `PROP-${new Date().getFullYear()}-${String(documentos.length + 1).padStart(3, "0")}`
    setZeroTitulo("")
    setZeroOrgao("")
    setZeroNumProposta(proxNumero)
    setZeroMunicipioUf(perfilAtivo.cidade_uf || "Goiânia/GO")
    setZeroObjeto("")
    setZeroModeloInicial("em_branco")
    setModalZeroOpen(true)
  }

  const handleConfirmarCriarDoZero = () => {
    const novo = criarNovoDocumentoDoZero({
      titulo: zeroTitulo.trim() || `Proposta ${zeroNumProposta} — ${zeroOrgao.trim() || "Novo Cliente"}`,
      orgaoCliente: zeroOrgao,
      numeroProposta: zeroNumProposta,
      municipioUf: zeroMunicipioUf,
      objeto: zeroObjeto,
      modeloInicial: zeroModeloInicial
    })
    setModalZeroOpen(false)
    setOrcamento(novo)
    setDocumentos(listarDocumentosCliente())
    setViewMode("planilha")
    toast.success("Documento iniciado do 0! Você já pode adicionar e editar itens seguindo o Modelo Base.")
    navegarPara("editor", novo.id)
  }

  const handleIniciarDoZeroDireto = () => {
    const proxNumero = `PROP-${new Date().getFullYear()}-${String(documentos.length + 1).padStart(3, "0")}`
    const novo = criarNovoDocumentoDoZero({
      titulo: `Novo Documento (${proxNumero})`,
      numeroProposta: proxNumero,
      municipioUf: perfilAtivo.cidade_uf || "Goiânia/GO",
      modeloInicial: "em_branco"
    })
    setOrcamento(novo)
    setDocumentos(listarDocumentosCliente())
    setViewMode("planilha")
    toast.success("Documento em branco iniciado do 0!")
    navegarPara("editor", novo.id)
  }

  const handleSelecionarArquivoPDFNoPerfil = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (pdfInputPerfilRef.current) pdfInputPerfilRef.current.value = ""
    if (!file) return

    setProcessandoPdfPerfil(true)
    const toastId = toast.loading(`Analisando PDF da licitação "${file.name}"...`)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/ai-edital", {
        method: "POST",
        body: formData
      })

      let dadosExtraidos: AiEditalResponse
      if (res.ok) {
        const json = await res.json()
        dadosExtraidos = json.data
        toast.dismiss(toastId)
        toast.success("Licitação extraída com sucesso! Abrindo arquivo pré-gerado...")
      } else {
        dadosExtraidos = gerarFallbackEditalDePDF(file)
        toast.dismiss(toastId)
        toast.success(`Arquivo pré-gerado com base no PDF "${file.name}"!`)
      }

      const docCriado = criarDocumentoAPartirDeEditalPDF(dadosExtraidos, file.name, BASE_DEMO)
      setOrcamento(docCriado)
      setDocumentos(listarDocumentosCliente())
      setViewMode("planilha")
      navegarPara("editor", docCriado.id)
    } catch {
      const dadosFallback = gerarFallbackEditalDePDF(file)
      const docCriado = criarDocumentoAPartirDeEditalPDF(dadosFallback, file.name, BASE_DEMO)
      toast.dismiss(toastId)
      toast.success(`Arquivo pré-gerado com base em "${file.name}"!`)
      setOrcamento(docCriado)
      setDocumentos(listarDocumentosCliente())
      setViewMode("planilha")
      navegarPara("editor", docCriado.id)
    } finally {
      setProcessandoPdfPerfil(false)
    }
  }

  const handleSimularUploadPDFNoPerfil = () => {
    setProcessandoPdfPerfil(true)
    const nomePdf = `Edital_Licitacao_Obras_${new Date().getFullYear()}_${Math.floor(Math.random() * 90) + 10}.pdf`
    const toastId = toast.loading(`Gerando documento a partir do PDF "${nomePdf}"...`)
    setTimeout(() => {
      const docCriado = criarDocumentoAPartirDeEditalPDF(
        EDITAL_DEMO,
        nomePdf,
        BASE_DEMO,
        `Licitação PDF — ${EDITAL_DEMO.metadados.numeroEdital}`
      )
      toast.dismiss(toastId)
      toast.success("Documento pré-gerado a partir da licitação em PDF!")
      setProcessandoPdfPerfil(false)
      setOrcamento(docCriado)
      setDocumentos(listarDocumentosCliente())
      setViewMode("planilha")
      navegarPara("editor", docCriado.id)
    }, 350)
  }

  const abrirModalEditarDoc = (doc: OrcamentoLicita) => {
    setDocEditando(doc)
    setEditTitulo(doc.titulo || "")
    setEditOrgao(doc.edital.orgao || "")
    setEditNumEdital(doc.edital.numero_edital || "")
    setEditObjeto(doc.edital.objeto || "")
    setEditStatus(doc.status || "rascunho")
    setModalEditarDocOpen(true)
  }

  const handleSalvarEdicaoRapidaDoc = () => {
    if (!docEditando) return
    atualizarMetadadosDocumento(docEditando.id, {
      titulo: editTitulo.trim() || "Documento sem título",
      orgao: editOrgao.trim(),
      cliente: editOrgao.trim(),
      numero_edital: editNumEdital.trim(),
      objeto: editObjeto.trim(),
      status: editStatus
    })
    setDocumentos(listarDocumentosCliente())
    setModalEditarDocOpen(false)
    toast.success("Informações do documento atualizadas!")
  }

  const handleDuplicarDoc = (id: string) => {
    const copia = duplicarDocumentoCliente(id)
    if (copia) {
      setDocumentos(listarDocumentosCliente())
      toast.success(`Cópia "${copia.titulo}" criada!`)
    }
  }

  const abrirModalConfirmarExclusao = (doc: OrcamentoLicita) => {
    setDocParaExcluir(doc)
    setModalExcluirOpen(true)
  }

  const handleConfirmarExclusao = () => {
    if (!docParaExcluir) return
    const novaLista = excluirDocumentoCliente(docParaExcluir.id)
    setDocumentos(novaLista)
    setModalExcluirOpen(false)
    setDocParaExcluir(null)
    toast.info("Documento excluído da sua lista.")
  }

  const handleRestaurarExemplos = () => {
    const lista = restaurarDocumentosExemplo()
    setDocumentos(lista)
    toast.success("Arquivos de exemplo restaurados!")
  }

  const abrirModalEditarPerfil = () => {
    setPerfNome(perfilAtivo.nome)
    setPerfCargo(perfilAtivo.cargo)
    setPerfEmpresa(perfilAtivo.empresa)
    setPerfCnpj(perfilAtivo.cnpj)
    setPerfTelefone(perfilAtivo.telefone)
    setPerfRespTecnico(perfilAtivo.responsavel_tecnico)
    setPerfRegistro(perfilAtivo.registro_profissional)
    setPerfCidadeUf(perfilAtivo.cidade_uf)
    setModalPerfilOpen(true)
  }

  const handleSalvarPerfil = () => {
    const atualizado: PerfilCliente = {
      ...perfilAtivo,
      nome: perfNome.trim() || perfilAtivo.nome,
      cargo: perfCargo.trim() || perfilAtivo.cargo,
      empresa: perfEmpresa.trim() || perfilAtivo.empresa,
      cnpj: perfCnpj.trim() || perfilAtivo.cnpj,
      telefone: perfTelefone.trim() || perfilAtivo.telefone,
      responsavel_tecnico: perfRespTecnico.trim() || perfilAtivo.responsavel_tecnico,
      registro_profissional: perfRegistro.trim() || perfilAtivo.registro_profissional,
      cidade_uf: perfCidadeUf.trim() || perfilAtivo.cidade_uf
    }
    salvarPerfilLogado(atualizado)
    setPerfil(atualizado)
    setModalPerfilOpen(false)
    toast.success("Dados do perfil e empresa atualizados!")
  }

  /* ============================================================================
   * HANDLERS DA ETAPA 4: EDITOR SEGUINDO O MODELO BASE
   * ========================================================================== */

  const handleUpdateOrcamentoNoEditor = (novoOrc: OrcamentoLicita) => {
    setOrcamento(novoOrc)
  }

  // Auto-save com debounce de 600ms para evitar bloqueio síncrono de localStorage a cada tecla
  useEffect(() => {
    if (etapa !== "editor") return
    const timer = window.setTimeout(() => {
      salvarDocumentoCliente(orcamento)
      setUltimoSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [orcamento, etapa])

  const handleSalvarManualNoEditor = () => {
    salvarDocumentoCliente(orcamento)
    setDocumentos(listarDocumentosCliente())
    setUltimoSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
    toast.success("Documento salvo com sucesso no seu Perfil!")
  }

  const handleUploadEditalPDFNoEditor = async (file: File) => {
    setIsProcessingAI(true)
    const toastId = toast.loading(`Analisando licitação "${file.name}"...`)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/ai-edital", {
        method: "POST",
        body: formData
      })

      let data: AiEditalResponse
      if (!res.ok) {
        data = gerarFallbackEditalDePDF(file)
        toast.dismiss(toastId)
        toast.info("Pré-gerando documento com base no PDF enviado.")
      } else {
        const json = await res.json()
        data = json.data
        toast.dismiss(toastId)
        toast.success("Edital analisado! Atualizando planilha...")
      }

      const novoOrc = montarOrcamentoDeEdital(data, baseReferencia, orcamento)
      novoOrc.id = orcamento.id
      novoOrc.origem = "pdf_licitacao"
      novoOrc.arquivo_origem_pdf = file.name
      handleUpdateOrcamentoNoEditor(novoOrc)
    } catch {
      const fallback = gerarFallbackEditalDePDF(file)
      const novoOrc = montarOrcamentoDeEdital(fallback, baseReferencia, orcamento)
      novoOrc.id = orcamento.id
      novoOrc.origem = "pdf_licitacao"
      novoOrc.arquivo_origem_pdf = file.name
      handleUpdateOrcamentoNoEditor(novoOrc)
      toast.dismiss(toastId)
      toast.success(`Documento atualizado com base em "${file.name}"!`)
    } finally {
      setIsProcessingAI(false)
    }
  }

  const handleMigrarBaseNoEditor = async (novaBaseId: string) => {
    if (!novaBaseId || novaBaseId === baseReferencia.base_id) return
    const toastId = toast.loading(`Migrando base para ${novaBaseId}...`)

    try {
      if (firebaseConfigurado) {
        const res = await executarMigracaoBase(orcamento, baseReferencia, novaBaseId)
        setBaseReferencia(res.base)
        handleUpdateOrcamentoNoEditor(res.orcamento)
        toast.dismiss(toastId)
        toast.success(`Migração concluída! ${res.alertas.length} alertas gerados.`)
      } else {
        handleUpdateOrcamentoNoEditor({ ...orcamento, ref_base_id: novaBaseId })
        toast.dismiss(toastId)
        toast.info(`Referência de base alterada para ${novaBaseId}`)
      }
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error(`Erro ao migrar base: ${err.message}`)
    }
  }

  /* ============================================================================
   * RENDERIZAÇÃO CONDICIONAL DAS 4 ETAPAS DO FLUXO
   * ========================================================================== */

  // ----------------------------------------------------------------------------
  // ETAPA 1: HOMEPAGE
  // ----------------------------------------------------------------------------
  if (etapa === "homepage") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-x-hidden">
        {/* NAVBAR DA HOMEPAGE */}
        <header className="w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-sm bg-slate-300" />
              <div>
                <span className="font-bold text-sm tracking-wider uppercase text-slate-100">
                  LicitaSaaS Engenharia
                </span>
                <span className="hidden sm:inline-block text-[11px] text-slate-400 ml-2">
                  • Orçamentação & Propostas de Licitações (SINAPI / GOINFRA)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {perfil ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navegarPara("perfil")}
                    className="h-9 text-xs bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 gap-1.5"
                  >
                    <UserCheck size={14} className="text-slate-400" /> Meu Perfil ({perfil.nome.split(" ")[0]})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => navegarPara("login")}
                    className="h-9 text-xs text-slate-400 hover:text-white"
                  >
                    Trocar Conta
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => navegarPara("login")}
                  className="h-9 text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold gap-1.5"
                >
                  <LogIn size={14} /> Fazer Login
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* CONTEÚDO PRINCIPAL DA HOMEPAGE */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 sm:py-16 space-y-16 z-10">
          {/* HERO SECTION */}
          <section className="text-center max-w-4xl mx-auto space-y-6">
            <Badge className="bg-slate-900 text-slate-300 border border-slate-800 text-xs font-normal px-3 py-1">
              PLATAFORMA DE ORÇAMENTAÇÃO DE OBRAS • SINAPI & GOINFRA • LEI 14.133/2021 & ACÓRDÃO TCU 2.622/2013
            </Badge>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-100 leading-tight">
              Elaboração de Propostas e Orçamentos de{" "}
              <span className="text-slate-300">
                Licitações no Modelo Base
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Plataforma integrada para engenheiros e construtoras: faça login, acesse seu perfil para{" "}
              <strong className="text-slate-200">iniciar um documento do 0</strong> ou{" "}
              <strong className="text-slate-200">gerar a partir do PDF de uma licitação</strong>, gerencie todos os seus arquivos com{" "}
              <strong className="text-slate-200">opções CRUD</strong> e edite seguindo o <strong className="text-slate-200">Modelo Base A4</strong>.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button
                type="button"
                onClick={() => navegarPara("login")}
                className="h-11 px-7 bg-slate-200 hover:bg-white text-slate-900 font-semibold text-sm gap-2"
              >
                <LogIn size={16} /> Fazer Login na Plataforma <ArrowRight size={16} />
              </Button>

              {perfil && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navegarPara("perfil")}
                  className="h-11 px-6 bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 text-sm font-medium gap-2"
                >
                  <FolderOpen size={16} className="text-slate-400" /> Ir Direto para Meu Perfil
                </Button>
              )}
            </div>
          </section>

          {/* FLUXO DE FUNCIONAMENTO EM 4 ETAPAS CLICÁVEIS */}
          <section className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                Como Funciona o Fluxo do Sistema
              </h2>
              <p className="text-xs text-slate-400">
                Clique em qualquer etapa abaixo ou clique em Fazer Login para iniciar
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Passo 1 */}
              <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-slate-300 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded">
                    ETAPA 1 (ATUAL)
                  </span>
                  <Layers className="w-4 h-4 text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-100">1. Homepage</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Página inicial com apresentação das ferramentas de orçamentação, bases oficiais e acesso rápido ao portal do cliente.
                </p>
              </div>

              {/* Passo 2 */}
              <button
                type="button"
                onClick={() => navegarPara("login")}
                className="text-left bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl p-5 space-y-3 transition-all group block w-full"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded">
                    ETAPA 2
                  </span>
                  <LogIn className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h3 className="text-sm font-bold text-slate-100">
                  2. Página para Fazer Login
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Autentique-se com seu e-mail e senha (ou crie seu perfil com os dados da construtora, CNPJ e CREA/CAU).
                </p>
              </button>

              {/* Passo 3 */}
              <button
                type="button"
                onClick={() => navegarPara("perfil")}
                className="text-left bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl p-5 space-y-3 transition-all group block w-full"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded">
                    ETAPA 3
                  </span>
                  <FolderOpen className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h3 className="text-sm font-bold text-slate-100">
                  3. Perfil (Do 0, PDF & CRUD)
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Escolha iniciar um documento do 0, iniciar com base em uma licitação vinda por PDF e gerencie seus arquivos com opções CRUD.
                </p>
              </button>

              {/* Passo 4 */}
              <button
                type="button"
                onClick={() => navegarPara("editor")}
                className="text-left bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl p-5 space-y-3 transition-all group block w-full"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded">
                    ETAPA 4
                  </span>
                  <FileText className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <h3 className="text-sm font-bold text-slate-100">
                  4. Editor no Modelo Base
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Edite o documento pré-gerado ou iniciado do 0, adicione etapas e serviços, ajuste BDI/Cronograma e exporte em A4.
                </p>
              </button>
            </div>
          </section>

          {/* DESTAQUES TÉCNICOS DO SISTEMA */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <FilePlus2 size={18} />
              </div>
              <h3 className="text-base font-bold text-slate-100">Criação do Zero ou via Licitação PDF</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Inicie uma proposta e planilha orçamentária do zero com composições oficiais SINAPI e GOINFRA,
                ou envie o PDF do edital para extração automática de metadados, itens, quantidades e BDI de referência.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <Calculator size={18} />
              </div>
              <h3 className="text-base font-bold text-slate-100">Gestão CRUD e Motor Orçamentário</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Todos os arquivos elaborados pelo cliente ficam salvos no Perfil com busca, filtro de status,
                edição rápida, duplicação e exclusão. No editor, adicione e edite serviços com cálculo reativo de CPU, Curva ABC e BDI TCU.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <Sparkles size={18} />
              </div>
              <h3 className="text-base font-bold text-slate-100">Fidelidade ao Modelo Base A4</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                O documento final é formatado em folha A4 padrão de licitações públicas (Lei 14.133/2021),
                com planilha sintética, valor por extenso, metodologia técnica, demonstrativo de BDI TCU, cronograma e assinaturas.
              </p>
            </div>
          </section>
        </main>

        {/* RODAPÉ */}
        <footer className="border-t border-slate-800/80 bg-slate-950 py-6 px-6 z-10">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-slate-400" />
              <span>LICITASAAS • PLATAFORMA DE ORÇAMENTAÇÃO E PROPOSTAS DE LICITAÇÕES DE OBRAS</span>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => navegarPara("login")} className="hover:text-slate-300 transition-colors">
                Login
              </button>
              <button type="button" onClick={() => navegarPara("perfil")} className="hover:text-slate-300 transition-colors">
                Perfil do Cliente
              </button>
              <button type="button" onClick={() => navegarPara("editor")} className="hover:text-slate-300 transition-colors">
                Editor Modelo Base
              </button>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  // ----------------------------------------------------------------------------
  // ETAPA 2: PÁGINA PARA FAZER LOGIN
  // ----------------------------------------------------------------------------
  if (etapa === "login") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden">
        {/* Topbar */}
        <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between z-10">
          <button
            type="button"
            onClick={() => navegarPara("homepage")}
            className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={15} /> Voltar para a Homepage
          </button>

          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-300">
              LicitaSaaS • Etapa 2: Login do Cliente
            </span>
          </div>
        </header>

        {/* Container Principal */}
        <main className="flex-1 flex items-center justify-center px-4 py-6 z-10">
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Coluna Esquerda */}
            <div className="lg:col-span-5 bg-slate-900/80 p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
              <div className="space-y-5">
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-normal">
                  LICITASAAS • LEI 14.133/2021 & SINAPI
                </Badge>

                <h1 className="text-2xl font-bold text-slate-100 leading-tight">
                  Acesse seu Perfil e Gerencie suas Propostas e Licitações
                </h1>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Após o login, você terá acesso imediato ao seu painel de perfil para iniciar documentos do zero,
                  gerar orçamentos a partir de editais em PDF com IA e gerenciar todos os arquivos já feitos.
                </p>

                <ul className="space-y-3 pt-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Inicie do Zero ou via PDF:</strong> Crie propostas do zero ou importe editais de licitação em PDF.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Gestão CRUD Completa:</strong> Crie, visualize, edite, duplique e exclua os documentos do cliente.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Modelo Base A4:</strong> Edite etapas, serviços, BDI TCU, cronograma e textos no Modelo Base.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Ambiente seguro com salvamento automático de documentos.</span>
              </div>
            </div>

            {/* Coluna Direita: Formulário de Login / Cadastro */}
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
              <Tabs value={abaLogin} onValueChange={(v) => setAbaLogin(v as any)} className="w-full">
                <TabsList className="grid grid-cols-2 bg-slate-950 border border-slate-800 h-10 mb-6">
                  <TabsTrigger value="login" className="text-xs font-semibold data-[state=active]:bg-slate-800">
                    Fazer Login
                  </TabsTrigger>
                  <TabsTrigger value="cadastro" className="text-xs font-semibold data-[state=active]:bg-slate-800">
                    Criar Conta / Perfil
                  </TabsTrigger>
                </TabsList>

                {/* ABA DE LOGIN */}
                <TabsContent value="login" className="space-y-4 mt-0">
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-300">E-mail Corporativo</Label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <Input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="seu.email@construtora.com.br"
                          className="pl-9 h-9 text-xs bg-slate-950 border-slate-700 text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-300">Senha de Acesso</Label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <Input
                          type="password"
                          required
                          value={loginSenha}
                          onChange={(e) => setLoginSenha(e.target.value)}
                          placeholder="••••••••"
                          className="pl-9 h-9 text-xs bg-slate-950 border-slate-700 text-slate-100"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-10 bg-slate-200 hover:bg-white text-slate-900 font-semibold text-xs gap-2"
                    >
                      <span>Entrar e Acessar Meu Perfil</span>
                      <ArrowRight size={15} />
                    </Button>
                  </form>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-800" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                      <span className="bg-slate-900 px-2 text-slate-500">Ou acesso imediato</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLoginDemo}
                    className="w-full h-10 bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200 text-xs font-medium gap-2"
                  >
                    <Sparkles size={14} className="text-slate-400" />
                    Entrar com Perfil Demo (Construtora Modelo)
                  </Button>
                </TabsContent>

                {/* ABA DE CADASTRO */}
                <TabsContent value="cadastro" className="space-y-3 mt-0">
                  <form onSubmit={handleCadastroSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Seu Nome</Label>
                        <div className="relative">
                          <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                          <Input
                            required
                            value={cadNome}
                            onChange={(e) => setCadNome(e.target.value)}
                            placeholder="Ex: Eng. Responsável"
                            className="pl-8 h-8 text-xs bg-slate-950 border-slate-700"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">E-mail</Label>
                        <Input
                          type="email"
                          required
                          value={cadEmail}
                          onChange={(e) => setCadEmail(e.target.value)}
                          placeholder="nome@empresa.com.br"
                          className="h-8 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Empresa Licitante / Proponente</Label>
                        <div className="relative">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                          <Input
                            value={cadEmpresa}
                            onChange={(e) => setCadEmpresa(e.target.value)}
                            className="pl-8 h-8 text-xs bg-slate-950 border-slate-700"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">CNPJ</Label>
                        <Input
                          value={cadCnpj}
                          onChange={(e) => setCadCnpj(e.target.value)}
                          className="h-8 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Responsável Técnico</Label>
                        <Input
                          value={cadRespTecnico}
                          onChange={(e) => setCadRespTecnico(e.target.value)}
                          className="h-8 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Registro CREA/CAU</Label>
                        <Input
                          value={cadCrea}
                          onChange={(e) => setCadCrea(e.target.value)}
                          className="h-8 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Cidade/UF</Label>
                        <Input
                          value={cadCidadeUf}
                          onChange={(e) => setCadCidadeUf(e.target.value)}
                          className="h-8 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">Senha</Label>
                      <Input
                        type="password"
                        required
                        value={cadSenha}
                        onChange={(e) => setCadSenha(e.target.value)}
                        placeholder="Crie uma senha"
                        className="h-8 text-xs bg-slate-950 border-slate-700"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-10 bg-slate-200 hover:bg-white text-slate-900 font-semibold text-xs gap-2 mt-2"
                    >
                      <span>Criar Perfil e Continuar</span>
                      <ArrowRight size={15} />
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>

        <footer className="w-full text-center py-4 text-[11px] text-slate-500 z-10">
          LicitaSaaS Engenharia — Fluxo Integrado: Homepage → Login → Perfil (CRUD) → Editor Modelo Base
        </footer>
      </div>
    )
  }

  // ----------------------------------------------------------------------------
  // ETAPA 3: PERFIL DO CLIENTE (DO 0, PDF DE LICITAÇÃO E CRUD DOS ARQUIVOS)
  // ----------------------------------------------------------------------------
  if (etapa === "perfil") {
    const documentosFiltrados = documentos.filter((d) => {
      if (filtroOrigem !== "todos" && (d.origem || "zero") !== filtroOrigem) return false
      if (filtroStatus !== "todos" && (d.status || "rascunho") !== filtroStatus) return false
      if (!buscaDocs.trim()) return true
      const termo = buscaDocs.toLowerCase()
      return (
        (d.titulo || "").toLowerCase().includes(termo) ||
        (d.edital.orgao || "").toLowerCase().includes(termo) ||
        (d.edital.numero_edital || "").toLowerCase().includes(termo) ||
        (d.edital.objeto || "").toLowerCase().includes(termo) ||
        (d.arquivo_origem_pdf || "").toLowerCase().includes(termo)
      )
    })

    const resumosPorDoc = new Map<string, { valorGlobal: number; bdiPct: number; qtdItens: number }>()
    let somaCarteira = 0
    documentos.forEach((d) => {
      const calc = calcularOrcamento(d, BASE_DEMO)
      resumosPorDoc.set(d.id, {
        valorGlobal: calc.valor_global,
        bdiPct: calc.bdi.bdi_percentual,
        qtdItens: calc.qtd_servicos
      })
      somaCarteira += calc.valor_global
    })

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* BARRA SUPERIOR DO PERFIL */}
        <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-6 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navegarPara("homepage")}
                className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
              >
                <div className="w-2.5 h-2.5 rounded-sm bg-slate-300" />
                <span className="font-bold text-sm tracking-wider uppercase">
                  LicitaSaaS
                </span>
              </button>
              <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 bg-slate-900 font-normal">
                Etapa 3 • Perfil do Cliente & CRUD
              </Badge>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="hidden md:flex items-center gap-2.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                <User size={14} className="text-slate-400" />
                <div>
                  <span className="font-semibold text-slate-200">{perfilAtivo.nome}</span>
                  <span className="text-slate-500 mx-1.5">•</span>
                  <span className="text-slate-400 text-[11px]">{perfilAtivo.empresa}</span>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={abrirModalEditarPerfil}
                className="h-8 text-xs bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Building2 size={13} className="mr-1.5 text-slate-400" /> Dados da Empresa
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => navegarPara("homepage")}
                className="h-8 text-xs text-slate-400 hover:text-white"
              >
                <Home size={13} className="mr-1" /> Homepage
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  realizarLogoutCliente()
                  setPerfil(null)
                  toast.info("Sessão encerrada.")
                  navegarPara("login")
                }}
                className="h-8 text-xs text-slate-400 hover:text-red-400"
              >
                <LogOut size={13} className="mr-1" /> Sair
              </Button>
            </div>
          </div>
        </header>

        {/* CONTEÚDO PRINCIPAL DO PERFIL */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
          {/* RESUMO DO PERFIL DO CLIENTE */}
          <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-normal">
                  ÁREA DO CLIENTE AUTENTICADA
                </Badge>
                <span className="text-xs text-slate-400 font-mono">CNPJ: {perfilAtivo.cnpj}</span>
                <span className="text-xs text-slate-400 font-mono">
                  • RT: {perfilAtivo.responsavel_tecnico} ({perfilAtivo.registro_profissional})
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
                Olá, {perfilAtivo.nome} — O que deseja elaborar hoje?
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
                Inicie um novo documento <strong className="text-slate-200">do zero</strong> seguindo o Modelo Base de licitações,{" "}
                <strong className="text-slate-200">importe o PDF de uma licitação</strong> para pré-gerar a planilha e a proposta automaticamente,
                ou gerencie os <strong className="text-slate-200">outros arquivos já feitos</strong> abaixo com opções CRUD.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                <span className="text-[10px] text-slate-400 uppercase block">Meus Arquivos</span>
                <span className="text-lg font-bold text-slate-100 font-mono">{documentos.length}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                <span className="text-[10px] text-slate-400 uppercase block">Via Licitação PDF</span>
                <span className="text-lg font-bold text-slate-200 font-mono">
                  {documentos.filter((d) => d.origem === "pdf_licitacao").length}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                <span className="text-[10px] text-slate-400 uppercase block">Total em Propostas</span>
                <span className="text-sm font-bold text-slate-100 font-mono">{fmtBRL(somaCarteira)}</span>
              </div>
            </div>
          </section>

          {/* DUAS OPÇÕES PRINCIPAIS PARA INICIAR DOCUMENTO */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* OPÇÃO 1: INICIAR UM DOCUMENTO DO 0 */}
            <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-6 flex flex-col justify-between transition-all group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <FilePlus2 size={20} />
                  </div>
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 bg-slate-900 font-normal">
                    OPÇÃO 1 • MODELO BASE
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-100">
                    Iniciar um Documento do 0
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Comece um orçamento e proposta de licitação do zero seguindo o Modelo Base oficial (Lei 14.133/2021).
                    Você poderá adicionar etapas, inserir composições da base SINAPI/GOINFRA ou itens próprios e editar todas as cláusulas.
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={abrirModalCriarDoZero}
                  className="flex-1 h-10 bg-slate-200 hover:bg-white text-slate-900 font-semibold text-xs gap-2"
                >
                  <FilePlus2 size={15} /> Configurar e Iniciar do 0 <ArrowRight size={14} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleIniciarDoZeroDireto}
                  className="h-10 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200"
                >
                  Abrir em Branco Direto
                </Button>
              </div>
            </div>

            {/* OPÇÃO 2: INICIAR COM BASE EM UMA LICITAÇÃO VINDA POR PDF */}
            <div className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-6 flex flex-col justify-between transition-all group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <FileUp size={20} />
                  </div>
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 bg-slate-900 font-normal">
                    OPÇÃO 2 • EXTRAÇÃO DE EDITAL PDF
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-100">
                    Iniciar com Base em uma Licitação vinda por PDF
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Envie o arquivo PDF do Edital, Termo de Referência ou Planilha Base da licitação. O sistema pré-gera
                    o documento com os itens, quantidades, BDI e exigências técnicas já formatados no Modelo Base para você editar.
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800 flex flex-wrap items-center gap-3">
                <input
                  ref={pdfInputPerfilRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleSelecionarArquivoPDFNoPerfil}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => pdfInputPerfilRef.current?.click()}
                  disabled={processandoPdfPerfil}
                  className="flex-1 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs gap-2"
                >
                  {processandoPdfPerfil ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" /> Processando PDF da Licitação...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} className="text-slate-300" /> Selecionar PDF da Licitação <ArrowRight size={14} />
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={processandoPdfPerfil}
                  onClick={handleSimularUploadPDFNoPerfil}
                  className="h-10 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300"
                  title="Testar geração imediata com um Edital PDF de exemplo"
                >
                  Testar com PDF Demo
                </Button>
              </div>
            </div>
          </section>

          {/* SEÇÃO CRUD: OUTROS ARQUIVOS JÁ FEITOS PELO CLIENTE */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-slate-400" />
                  Outros Arquivos Já Feitos pelo Cliente — Opções CRUD ({documentosFiltrados.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Visualize, abra no editor para adicionar/editar itens seguindo o Modelo Base, atualize informações, duplique ou exclua.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleRestaurarExemplos}
                  className="h-8 text-xs text-slate-400 hover:text-slate-200"
                  title="Recarregar os 3 documentos de demonstração"
                >
                  <RotateCcw size={13} className="mr-1.5" /> Restaurar Exemplos
                </Button>
              </div>
            </div>

            {/* Barra de Busca e Filtros CRUD */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <Input
                  value={buscaDocs}
                  onChange={(e) => setBuscaDocs(e.target.value)}
                  placeholder="Buscar nos seus arquivos por título, cliente, órgão, nº do edital ou PDF..."
                  className="pl-9 h-9 text-xs bg-slate-950 border-slate-700 text-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value as any)}
                  className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200"
                >
                  <option value="todos">Origem: Todas</option>
                  <option value="zero">Iniciados do 0</option>
                  <option value="pdf_licitacao">Vindos de PDF de Licitação</option>
                </select>

                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value as any)}
                  className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200"
                >
                  <option value="todos">Status: Todos</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="em_revisao">Em Revisão</option>
                  <option value="finalizado">Finalizado</option>
                </select>
              </div>
            </div>

            {/* Lista de Documentos do Cliente com Opções CRUD */}
            {documentosFiltrados.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <FileText className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-sm font-bold text-slate-300">Nenhum documento encontrado</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Você pode iniciar um novo documento do zero, enviar um PDF de licitação acima ou restaurar os arquivos de exemplo.
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={abrirModalCriarDoZero}
                    className="bg-slate-200 hover:bg-white text-slate-900 text-xs font-semibold"
                  >
                    <FilePlus2 size={14} className="mr-1.5" /> Iniciar Documento do 0
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRestaurarExemplos}
                    className="border-slate-700 text-xs"
                  >
                    Restaurar Arquivos de Exemplo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {documentosFiltrados.map((doc) => {
                  const resumo = resumosPorDoc.get(doc.id) || { valorGlobal: 0, bdiPct: 0, qtdItens: 0 }
                  const statusAtual = doc.status || "rascunho"
                  const origemAtual = doc.origem || "zero"

                  return (
                    <div
                      key={doc.id}
                      className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {origemAtual === "pdf_licitacao" ? (
                            <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-normal gap-1">
                              <FileUp size={11} /> Baseado em Licitação (PDF)
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-normal gap-1">
                              <FilePlus2 size={11} /> Iniciado do 0 (Modelo Base)
                            </Badge>
                          )}

                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal border-slate-700 text-slate-300 bg-slate-900"
                          >
                            {statusAtual === "finalizado" ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 size={10} /> Finalizado
                              </span>
                            ) : statusAtual === "em_revisao" ? (
                              <span className="flex items-center gap-1">
                                <Clock size={10} /> Em Revisão
                              </span>
                            ) : (
                              "Rascunho"
                            )}
                          </Badge>

                          {doc.edital.numero_edital && (
                            <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              {doc.edital.numero_edital}
                            </span>
                          )}

                          {doc.arquivo_origem_pdf && (
                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                              PDF: {doc.arquivo_origem_pdf}
                            </span>
                          )}
                        </div>

                        <h3
                          onClick={() => navegarPara("editor", doc.id)}
                          className="text-base font-bold text-slate-100 hover:text-white cursor-pointer transition-colors truncate"
                        >
                          {doc.titulo || doc.edital.objeto || "Documento de Orçamento"}
                        </h3>

                        <p className="text-xs text-slate-400 line-clamp-2">
                          <strong className="text-slate-300">Cliente / Órgão:</strong>{" "}
                          {doc.edital.orgao || "Não especificado"} •{" "}
                          <strong className="text-slate-300">Local:</strong> {doc.edital.municipio_uf || "-"} •{" "}
                          <strong className="text-slate-300">Objeto:</strong>{" "}
                          {doc.edital.objeto || "Sem descrição detalhada."}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-500">
                          <span>
                            Etapas: <strong className="text-slate-300">{doc.itens_planilha.length}</strong>
                          </span>
                          <span>
                            Serviços/Itens: <strong className="text-slate-300">{resumo.qtdItens}</strong>
                          </span>
                          <span>
                            BDI: <strong className="text-slate-300">{fmtPct(resumo.bdiPct)}</strong>
                          </span>
                          <span>
                            Atualizado em:{" "}
                            <strong className="text-slate-300">
                              {new Date(doc.atualizado_em).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Valor e Botões de Ação CRUD */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                        <div className="lg:text-right">
                          <span className="text-[10px] text-slate-400 uppercase block">Valor Global c/ BDI</span>
                          <span className="text-lg font-bold font-mono text-slate-100">
                            {fmtBRL(resumo.valorGlobal)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => navegarPara("editor", doc.id)}
                            className="h-8 text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold gap-1.5"
                          >
                            <ExternalLink size={13} /> Abrir / Editar no Modelo Base
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => abrirModalEditarDoc(doc)}
                            className="h-8 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200 gap-1"
                            title="Editar Título, Cliente e Status (Update)"
                          >
                            <Pencil size={13} /> Editar Info
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDuplicarDoc(doc.id)}
                            className="h-8 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300 gap-1"
                            title="Duplicar Documento"
                          >
                            <Copy size={13} /> Duplicar
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => abrirModalConfirmarExclusao(doc)}
                            className="h-8 text-xs bg-slate-950 hover:bg-red-950/60 border-slate-800 hover:border-red-800/60 text-slate-400 hover:text-red-400"
                            title="Excluir Documento (Delete)"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </main>

        {/* MODAL 1: CONFIGURAR E INICIAR DOCUMENTO DO 0 */}
        <Dialog open={modalZeroOpen} onOpenChange={setModalZeroOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FilePlus2 className="w-5 h-5 text-slate-400" />
                Iniciar Novo Documento do 0 (Modelo Base)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Preencha as informações iniciais (opcional) e escolha se deseja começar com a planilha 100% em branco ou com estrutura inicial de licitação de obra pública (SINAPI).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Estrutura Inicial do Modelo Base</Label>
                <select
                  value={zeroModeloInicial}
                  onChange={(e) => setZeroModeloInicial(e.target.value as ModeloInicialZero)}
                  className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 font-medium"
                >
                  <option value="em_branco">100% do Zero (Planilha em Branco no Modelo Base)</option>
                  <option value="obra_publica">Modelo Base — Licitação de Obra Pública (SINAPI)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Título do Documento</Label>
                <Input
                  value={zeroTitulo}
                  onChange={(e) => setZeroTitulo(e.target.value)}
                  placeholder="Ex: Proposta de Preços — Concorrência 015/2026"
                  className="h-8 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Cliente / Órgão Licitante</Label>
                  <Input
                    value={zeroOrgao}
                    onChange={(e) => setZeroOrgao(e.target.value)}
                    placeholder="Nome do Cliente ou Órgão"
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Nº da Proposta / Edital</Label>
                  <Input
                    value={zeroNumProposta}
                    onChange={(e) => setZeroNumProposta(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Município / UF da Obra</Label>
                <Input
                  value={zeroMunicipioUf}
                  onChange={(e) => setZeroMunicipioUf(e.target.value)}
                  placeholder="Ex: Brasília/DF ou Goiânia/GO"
                  className="h-8 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Objeto / Escopo Inicial</Label>
                <Textarea
                  value={zeroObjeto}
                  onChange={(e) => setZeroObjeto(e.target.value)}
                  placeholder="Descreva resumidamente o objeto da proposta ou licitação..."
                  className="text-xs min-h-[65px] bg-slate-950 border-slate-700"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalZeroOpen(false)}
                className="text-xs text-slate-400"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmarCriarDoZero}
                className="text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold gap-1.5"
              >
                Criar e Abrir no Editor <ArrowRight size={13} />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL 2: EDITAR METADADOS DO ARQUIVO (UPDATE CRUD) */}
        <Dialog open={modalEditarDocOpen} onOpenChange={setModalEditarDocOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-white">
                Editar Informações do Documento
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Atualize rapidamente o título, cliente/órgão, número e status deste arquivo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Título do Documento</Label>
                <Input
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  className="h-8 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Nº Edital / Proposta</Label>
                  <Input
                    value={editNumEdital}
                    onChange={(e) => setEditNumEdital(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Status</Label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as StatusDocumento)}
                    className="w-full h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="em_revisao">Em Revisão</option>
                    <option value="finalizado">Finalizado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Cliente / Órgão Licitante</Label>
                <Input
                  value={editOrgao}
                  onChange={(e) => setEditOrgao(e.target.value)}
                  className="h-8 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-slate-300">Objeto</Label>
                <Textarea
                  value={editObjeto}
                  onChange={(e) => setEditObjeto(e.target.value)}
                  className="text-xs min-h-[65px] bg-slate-950 border-slate-700"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalEditarDocOpen(false)}
                className="text-xs text-slate-400"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSalvarEdicaoRapidaDoc}
                className="text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold"
              >
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL 3: CONFIRMAR EXCLUSÃO (DELETE CRUD) */}
        <Dialog open={modalExcluirOpen} onOpenChange={setModalExcluirOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-red-400">
                Confirmar Exclusão de Documento
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Tem certeza que deseja excluir o arquivo{" "}
                <strong className="text-slate-200">&ldquo;{docParaExcluir?.titulo}&rdquo;</strong>? Esta ação removerá o
                documento da sua lista no perfil.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalExcluirOpen(false)}
                className="text-xs text-slate-400"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleConfirmarExclusao}
                className="text-xs bg-red-600 hover:bg-red-500 text-white"
              >
                <Trash2 size={13} className="mr-1.5" /> Excluir Documento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL 4: EDITAR DADOS DO PERFIL / EMPRESA */}
        <Dialog open={modalPerfilOpen} onOpenChange={setModalPerfilOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-white">
                Dados do Perfil e Empresa Proponente
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Estes dados são aplicados automaticamente no cabeçalho e assinaturas do Modelo Base em novos documentos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-300">Seu Nome</Label>
                  <Input
                    value={perfNome}
                    onChange={(e) => setPerfNome(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Cargo</Label>
                  <Input
                    value={perfCargo}
                    onChange={(e) => setPerfCargo(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-[11px] text-slate-300">Razão Social da Empresa</Label>
                  <Input
                    value={perfEmpresa}
                    onChange={(e) => setPerfEmpresa(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">CNPJ</Label>
                  <Input
                    value={perfCnpj}
                    onChange={(e) => setPerfCnpj(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-300">Responsável Técnico</Label>
                  <Input
                    value={perfRespTecnico}
                    onChange={(e) => setPerfRespTecnico(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Registro Profissional (CREA/CAU)</Label>
                  <Input
                    value={perfRegistro}
                    onChange={(e) => setPerfRegistro(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-300">Telefone de Contato</Label>
                  <Input
                    value={perfTelefone}
                    onChange={(e) => setPerfTelefone(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Cidade / UF Padrão</Label>
                  <Input
                    value={perfCidadeUf}
                    onChange={(e) => setPerfCidadeUf(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalPerfilOpen(false)}
                className="text-xs text-slate-400"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSalvarPerfil}
                className="text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold"
              >
                Salvar Dados do Perfil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ----------------------------------------------------------------------------
  // ETAPA 4: MÓDULO CONSTRUTOR DE PROPOSTAS DE LICITAÇÃO DE ENGENHARIA (SPLIT-SCREEN A4)
  // ----------------------------------------------------------------------------
  if (modoEditor === "construtor_a4") {
    return (
      <PropostaConstrutorModulo
        orcamentoAtivo={orcamento}
        listaLicitacoesSaaS={documentos.length > 0 ? documentos : listarDocumentosCliente()}
        baseReferencia={baseReferencia}
        perfilCliente={perfilAtivo}
        onUpdateOrcamentoSaaS={(novoOrc) => {
          handleUpdateOrcamentoNoEditor(novoOrc)
          setDocumentos(listarDocumentosCliente())
        }}
        onSelecionarLicitacaoSaaS={(id) => {
          const doc = obterDocumentoPorId(id)
          if (doc) {
            setOrcamento(doc)
            definirDocumentoAtivoId(id)
          }
        }}
        onUploadEditalPDF={handleUploadEditalPDFNoEditor}
        isProcessingAI={isProcessingAI}
        onVoltarPerfil={() => {
          salvarDocumentoCliente(orcamento)
          navegarPara("perfil")
        }}
        onAlternarModoPlanilhaAnalitica={() => setModoEditor("cpu_analitico")}
      />
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col-reverse lg:flex-row w-full bg-slate-950 overflow-hidden print:static print:h-auto print:block print:bg-white print:overflow-visible">
      {/* PAINEL LATERAL ESQUERDO: BARRA DE EDIÇÃO */}
      <EditorSidebar
        orcamento={orcamento}
        resultado={resultado}
        baseReferencia={baseReferencia}
        catalogoBases={catalogoBases}
        onUpdateOrcamento={handleUpdateOrcamentoNoEditor}
        onUploadEditalPDF={handleUploadEditalPDFNoEditor}
        onMigrarBase={handleMigrarBaseNoEditor}
        isProcessingAI={isProcessingAI}
      />

      {/* ÁREA DE TRABALHO DIREITA: NAVEGAÇÃO DE VIEWS + CONTEÚDO PRINCIPAL */}
      <main className="min-w-0 flex-1 h-[55dvh] lg:h-full flex flex-col bg-slate-950/80 overflow-hidden relative print:block print:h-auto print:overflow-visible">
        {/* BARRA SUPERIOR DE NAVEGAÇÃO */}
        <header className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden z-30">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                salvarDocumentoCliente(orcamento)
                navegarPara("perfil")
              }}
              className="h-8 text-xs bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-700 gap-1.5"
            >
              <ArrowLeft size={14} /> Voltar ao Perfil
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setModoEditor("construtor_a4")}
              className="h-8 text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold gap-1.5"
            >
              <Sparkles size={13} /> Voltar ao Construtor Split-Screen A4 (6 Passos)
            </Button>

            <div className="h-5 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              {orcamento.origem === "pdf_licitacao" ? (
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-normal gap-1 h-6">
                  <FileUp size={11} /> Pré-gerado via PDF
                </Badge>
              ) : (
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-normal gap-1 h-6">
                  <FilePlus2 size={11} /> Iniciado do 0
                </Badge>
              )}

              <select
                value={orcamento.status || "rascunho"}
                onChange={(e) =>
                  handleUpdateOrcamentoNoEditor({
                    ...orcamento,
                    status: e.target.value as StatusDocumento
                  })
                }
                className="h-7 rounded border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-200 font-medium"
              >
                <option value="rascunho">Status: Rascunho</option>
                <option value="em_revisao">Status: Em Revisão</option>
                <option value="finalizado">Status: Finalizado</option>
              </select>
            </div>

            <div className="h-5 w-px bg-slate-800 hidden md:block" />

            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as any)}
              className="w-auto"
            >
              <TabsList className="bg-slate-950 border border-slate-800 h-9">
                <TabsTrigger
                  value="planilha"
                  className="text-xs data-[state=active]:bg-slate-800 flex items-center gap-1.5"
                >
                  <Calculator size={14} /> Planilha (Adicionar/Editar)
                </TabsTrigger>
                <TabsTrigger
                  value="cronograma"
                  className="text-xs data-[state=active]:bg-slate-800 flex items-center gap-1.5"
                >
                  <Calendar size={14} /> Cronograma
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  className="text-xs data-[state=active]:bg-slate-800 flex items-center gap-1.5"
                >
                  <FileText size={14} /> Modelo Base A4
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* INDICADORES EM TEMPO REAL E BOTÕES DE SALVAR / EXPORTAR */}
          <div className="flex items-center gap-3 text-xs font-mono">
            {ultimoSalvoEm && (
              <span className="hidden xl:flex items-center gap-1 text-[10px] text-slate-400 font-sans">
                <CheckCircle2 size={12} className="text-slate-400" /> Salvo às {ultimoSalvoEm}
              </span>
            )}

            {resultado.qtd_orfaos > 0 && (
              <Badge variant="destructive" className="h-6 gap-1 font-sans text-[10px]">
                <AlertTriangle size={12} /> {resultado.qtd_orfaos} Órfãos
              </Badge>
            )}

            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-sans">
                Total c/ BDI ({fmtPct(resultado.bdi.bdi_percentual)}):
              </span>
              <span className="font-bold text-slate-100 text-sm">
                {fmtBRL(resultado.valor_global)}
              </span>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleSalvarManualNoEditor}
              className="h-8 text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold"
            >
              <Save size={13} className="mr-1.5" /> Salvar
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (viewMode !== "preview") {
                  setViewMode("preview")
                  setTimeout(() => window.print(), 250)
                } else {
                  window.print()
                }
              }}
              className="h-8 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <Download size={13} className="mr-1.5" /> Imprimir / PDF
            </Button>
          </div>
        </header>

        {/* CONTAINER DO WORKSPACE DINÂMICO */}
        <div className="flex-1 overflow-auto p-4 lg:p-6 print:p-0 print:overflow-visible">
          {viewMode === "planilha" && (
            <div className="max-w-7xl mx-auto space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-sm font-bold text-slate-100">
                    {orcamento.titulo || orcamento.edital.objeto || "Documento de Orçamento e Proposta"}
                  </h1>
                  <p className="text-xs text-slate-400">
                    Cliente/Órgão:{" "}
                    <strong className="text-slate-200">
                      {orcamento.edital.orgao || "Não informado (edite na barra lateral)"}
                    </strong>{" "}
                    • Edital/Proposta:{" "}
                    <strong className="text-slate-200">
                      {orcamento.edital.numero_edital || orcamento.modelo_base?.num_proposta || "-"}
                    </strong>
                    {orcamento.arquivo_origem_pdf && (
                      <span className="ml-2 text-slate-400">
                        • PDF base: {orcamento.arquivo_origem_pdf}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setViewMode("preview")}
                    className="h-8 text-xs bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    <FileText size={13} className="mr-1.5" /> Ver no Modelo Base A4
                  </Button>
                </div>
              </div>

              <BudgetTable
                orcamento={orcamento}
                resultado={resultado}
                baseReferencia={baseReferencia}
                onUpdateOrcamento={handleUpdateOrcamentoNoEditor}
              />
            </div>
          )}

          {viewMode === "cronograma" && (
            <div className="max-w-7xl mx-auto">
              <ScheduleTable
                orcamento={orcamento}
                resultado={resultado}
                onUpdateOrcamento={handleUpdateOrcamentoNoEditor}
              />
            </div>
          )}

          {viewMode === "preview" && (
            <div className="flex justify-center w-full">
              <DocumentPreview
                orcamento={orcamento}
                resultado={resultado}
                zoom={zoom}
              />
              <div className="print:hidden">
                <ZoomControls zoom={zoom} onZoomChange={setZoom} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

