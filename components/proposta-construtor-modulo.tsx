"use client"

import React, { useState, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import {
  Building2,
  FileText,
  Calculator,
  Calendar,
  Scale,
  Palette,
  Save,
  Printer,
  Download,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Gavel,
  RotateCcw,
  Upload,
  Landmark,
  UserCheck,
  HardHat,
  Eye,
  Columns,
  Bold,
  Italic,
  List,
  AlertCircle,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { toast } from "sonner"

import type { OrcamentoLicita, BaseReferencia } from "@/lib/proposal-types"
import type { PerfilCliente } from "@/lib/client-storage"
import {
  FONTES_REFERENCIA,
  MODALIDADES,
  PORTAIS,
  UNIDADES_MEDIDA,
  TITULOS_PROFISSIONAIS,
  ROTULOS_PERIODO,
  UFS,
  type PropostaComercial,
  type FonteReferencia,
  type ServicoProposta,
  type EtapaProposta,
} from "@/lib/proposta-comercial/schema"
import {
  calcularPropostaComercial,
  aplicarReadequacaoDisputa,
  limparReadequacaoDisputa,
  converterOrcamentoSaaSParaProposta,
  sincronizarPropostaParaOrcamentoSaaS,
  salvarPropostaNoSaaS,
  fmtMoedaBRL,
  fmtNumeroBR,
  fmtPercentualBR,
  truncarMoeda2,
  arredondarMoeda2,
} from "@/lib/proposta-comercial/engine"
import { DECLARACOES_LEI_14133 } from "@/lib/templates"
import { PropostaA4Preview } from "@/components/proposta-a4-preview"

interface PropostaConstrutorModuloProps {
  orcamentoAtivo: OrcamentoLicita
  listaLicitacoesSaaS: OrcamentoLicita[]
  baseReferencia: BaseReferencia
  perfilCliente: PerfilCliente
  onUpdateOrcamentoSaaS: (orc: OrcamentoLicita) => void
  onSelecionarLicitacaoSaaS: (id: string) => void
  onUploadEditalPDF: (file: File) => Promise<void>
  isProcessingAI?: boolean
  onVoltarPerfil: () => void
  onAlternarModoPlanilhaAnalitica?: () => void
}

const PASSOS_WIZARD = [
  {
    numero: 1,
    id: "certame",
    titulo: "1. Certame & Órgão",
    subtitulo: "Identificação da Licitação e Modalidade",
    icone: Landmark,
  },
  {
    numero: 2,
    id: "proponente",
    titulo: "2. Proponente & RT",
    subtitulo: "Empresa, Banco, Representante e CREA/CAU",
    icone: Building2,
  },
  {
    numero: 3,
    id: "planilha",
    titulo: "3. Planilha, BDI & Disputa",
    subtitulo: "Orçamento, Simulador de Lance e Extenso",
    icone: Calculator,
  },
  {
    numero: 4,
    id: "cronograma",
    titulo: "4. Cronograma Físico-Fin.",
    subtitulo: "Desembolso e Avanço por Período",
    icone: Calendar,
  },
  {
    numero: 5,
    id: "condicoes",
    titulo: "5. Condições & Lei 14.133",
    subtitulo: "Prazos, Garantia e Declarações Legais",
    icone: Scale,
  },
  {
    numero: 6,
    id: "identidade",
    titulo: "6. Identidade & Assinaturas",
    subtitulo: "Logotipo, Cores e Fechamento A4",
    icone: Palette,
  },
] as const

const CORES_CORPORATIVAS = [
  { nome: "Grafite Neutro", hex: "#334155" },
  { nome: "Ardósia Escuro", hex: "#1e293b" },
  { nome: "Zinco Corporativo", hex: "#3f3f46" },
  { nome: "Cinza Executivo", hex: "#475569" },
  { nome: "Azul Institucional Sóbrio", hex: "#1e3a5f" },
  { nome: "Carbono", hex: "#27272a" },
]

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function PropostaConstrutorModulo({
  orcamentoAtivo,
  listaLicitacoesSaaS,
  baseReferencia,
  perfilCliente,
  onUpdateOrcamentoSaaS,
  onSelecionarLicitacaoSaaS,
  onUploadEditalPDF,
  isProcessingAI = false,
  onVoltarPerfil,
  onAlternarModoPlanilhaAnalitica,
}: PropostaConstrutorModuloProps) {
  const [passoAtual, setPassoAtual] = useState<number>(1)
  const [zoomA4, setZoomA4] = useState<number>(0.85)
  const [layoutMobile, setLayoutMobile] = useState<"split" | "wizard" | "preview">("split")
  const [ultimoSalvoHora, setUltimoSalvoHora] = useState<string>("")

  // Inicializa ou hidrata a PropostaComercial vinculada ao orcamentoAtivo
  const [proposta, setProposta] = useState<PropostaComercial>(() =>
    converterOrcamentoSaaSParaProposta(
      orcamentoAtivo,
      baseReferencia,
      perfilCliente,
    ),
  )

  // Sempre que o usuário trocar de licitação ativa no SaaS, recarrega a proposta correspondente
  useEffect(() => {
    setProposta(
      converterOrcamentoSaaSParaProposta(
        orcamentoAtivo,
        baseReferencia,
        perfilCliente,
      ),
    )
  }, [orcamentoAtivo.id])

  // Refs para uploads de arquivos
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const assRepInputRef = useRef<HTMLInputElement>(null)
  const assRtInputRef = useRef<HTMLInputElement>(null)

  // Cálculo em tempo real da proposta e cronograma
  const resultado = useMemo(
    () => calcularPropostaComercial(proposta),
    [proposta],
  )

  // Estados locais para o Simulador de Lance / Disputa no Passo 3
  const [modoDisputa, setModoDisputa] = useState<"valor" | "percentual">(
    proposta.orcamento.disputa.modo || "valor",
  )
  const [inputValorArrematado, setInputValorArrematado] = useState<string>(() =>
    proposta.orcamento.disputa.valor_arrematado != null
      ? String(proposta.orcamento.disputa.valor_arrematado)
      : String(
          arredondarMoeda2(
            calcularPropostaComercial(proposta).valor_global_inicial * 0.95,
          ),
        ),
  )
  const [inputDescontoPct, setInputDescontoPct] = useState<string>(() =>
    String(proposta.orcamento.disputa.desconto_pct ?? 5),
  )

  // Atualizador puro de estado (sem efeitos colaterais ou I/O síncrono dentro do setState)
  const atualizarProposta = (
    updater: (prev: PropostaComercial) => PropostaComercial,
  ) => {
    setProposta((prev) => updater(prev))
  }

  // Auto-save com debounce de 600ms para evitar bloqueio da thread principal a cada tecla digitada
  useEffect(() => {
    const timer = window.setTimeout(() => {
      salvarPropostaNoSaaS(proposta)
      setUltimoSalvoHora(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      )
    }, 600)
    return () => window.clearTimeout(timer)
  }, [proposta])

  // Salvar explicitamente no SaaS e sincronizar com o objeto OrcamentoLicita do Perfil
  const handleSalvarRascunhoSaaS = () => {
    const salva = salvarPropostaNoSaaS(proposta)
    const orcSincronizado = sincronizarPropostaParaOrcamentoSaaS(
      salva,
      orcamentoAtivo,
    )
    onUpdateOrcamentoSaaS(orcSincronizado)
    setUltimoSalvoHora(
      new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    )
    toast.success(
      "Proposta Comercial salva e sincronizada com a licitação no SaaS!",
    )
  }

  // Exportar o estado JSON modular pronto para banco de dados
  const handleExportarJSON = () => {
    const blob = new Blob([JSON.stringify(proposta, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `proposta-${(proposta.certame.numero_edital || proposta.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Arquivo JSON modular da proposta exportado!")
  }

  // Upload de Imagem (Logotipo ou Rubrica) com redimensionamento e compressão automática via <canvas>
  const converterImagemParaDataUrl = (
    file: File,
    callback: (dataUrl: string) => void,
  ) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 10 MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") return
      const img = new Image()
      img.onload = () => {
        try {
          const maxW = 420
          const maxH = 140
          let w = img.width
          let h = img.height
          if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h)
            w = Math.max(1, Math.round(w * ratio))
            h = Math.max(1, Math.round(h * ratio))
          }
          const canvas = document.createElement("canvas")
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            callback(reader.result as string)
            return
          }
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          const comprimida = canvas.toDataURL("image/png", 0.85)
          callback(comprimida)
        } catch {
          callback(reader.result as string)
        }
      }
      img.onerror = () => callback(reader.result as string)
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  // Handler do Simulador de Disputa (Readequação Pós-Fase de Lances)
  const handleAplicarDisputa = () => {
    if (resultado.qtd_itens === 0) {
      toast.error("Adicione ao menos um item na planilha antes de simular a disputa.")
      return
    }
    const valorNum = parseFloat(inputValorArrematado.replace(",", "."))
    const descNum = parseFloat(inputDescontoPct.replace(",", "."))

    if (modoDisputa === "valor" && (!Number.isFinite(valorNum) || valorNum <= 0)) {
      toast.error("Informe um Valor Global Arrematado válido (maior que zero).")
      return
    }
    if (
      modoDisputa === "percentual" &&
      (!Number.isFinite(descNum) || descNum <= 0 || descNum >= 100)
    ) {
      toast.error("Informe um Percentual de Desconto Linear entre 0,01% e 99,99%.")
      return
    }

    const res = aplicarReadequacaoDisputa(proposta, {
      modo: modoDisputa,
      valor_arrematado: valorNum,
      desconto_pct: descNum,
    })

    setProposta(res.proposta)
    salvarPropostaNoSaaS(res.proposta)
    const orcSinc = sincronizarPropostaParaOrcamentoSaaS(
      res.proposta,
      orcamentoAtivo,
    )
    onUpdateOrcamentoSaaS(orcSinc)

    if (Math.abs(res.residuo) < 0.01) {
      toast.success(
        `Planilha readequada com fechamento exato em ${fmtMoedaBRL(res.valorObtido)} (Desconto de ${fmtPercentualBR(res.descontoEfetivoPct)})!`,
      )
    } else {
      toast.info(
        `Planilha readequada para ${fmtMoedaBRL(res.valorObtido)} (Diferença residual indivisível de ${fmtMoedaBRL(res.residuo)}).`,
      )
    }
  }

  const handleRestaurarPrecosIniciais = () => {
    const limpa = limparReadequacaoDisputa(proposta)
    setProposta(limpa)
    salvarPropostaNoSaaS(limpa)
    toast.info("Preços unitários restaurados aos valores iniciais sem desconto de disputa.")
  }

  // Manipulação de Etapas e Serviços na Planilha (Passo 3)
  const handleAdicionarEtapa = () => {
    const novaEtapa: EtapaProposta = {
      id: uid(),
      descricao: `Nova Etapa ${proposta.orcamento.etapas.length + 1}`,
      servicos: [
        {
          id: uid(),
          codigo: "87878",
          fonte: "SINAPI",
          descricao: "NOVO SERVIÇO DE ENGENHARIA CONFORME PROJETO BÁSICO",
          unidade: "m²",
          quantidade: 10,
          custo_unitario: 100,
          bdi_tipo: "normal",
          preco_readequado: null,
        },
      ],
    }

    atualizarProposta((prev) => ({
      ...prev,
      orcamento: {
        ...prev.orcamento,
        etapas: [...prev.orcamento.etapas, novaEtapa],
      },
    }))
    toast.success("Nova etapa adicionada à planilha!")
  }

  const handleRemoverEtapa = (etapaId: string) => {
    if (proposta.orcamento.etapas.length <= 1) {
      toast.error("A planilha deve possuir pelo menos uma etapa.")
      return
    }
    atualizarProposta((prev) => {
      const novaDist = { ...prev.cronograma.distribuicao }
      delete novaDist[etapaId]
      return {
        ...prev,
        orcamento: {
          ...prev.orcamento,
          etapas: prev.orcamento.etapas.filter((e) => e.id !== etapaId),
        },
        cronograma: {
          ...prev.cronograma,
          distribuicao: novaDist,
        },
      }
    })
  }

  const handleAdicionarServico = (etapaId: string) => {
    const novoServico: ServicoProposta = {
      id: uid(),
      codigo: "92915",
      fonte: "SINAPI",
      descricao: "SERVIÇO DE ENGENHARIA / COMPOSIÇÃO DE CUSTO UNITÁRIO",
      unidade: "m³",
      quantidade: 1,
      custo_unitario: 150,
      bdi_tipo: "normal",
      preco_readequado: null,
    }
    atualizarProposta((prev) => ({
      ...prev,
      orcamento: {
        ...prev.orcamento,
        etapas: prev.orcamento.etapas.map((et) =>
          et.id === etapaId
            ? { ...et, servicos: [...et.servicos, novoServico] }
            : et,
        ),
      },
    }))
  }

  const handleAtualizarServico = (
    etapaId: string,
    servicoId: string,
    patch: Partial<ServicoProposta>,
  ) => {
    atualizarProposta((prev) => ({
      ...prev,
      orcamento: {
        ...prev.orcamento,
        etapas: prev.orcamento.etapas.map((et) =>
          et.id === etapaId
            ? {
                ...et,
                servicos: et.servicos.map((s) =>
                  s.id === servicoId ? { ...s, ...patch } : s,
                ),
              }
            : et,
        ),
      },
    }))
  }

  const handleRemoverServico = (etapaId: string, servicoId: string) => {
    atualizarProposta((prev) => ({
      ...prev,
      orcamento: {
        ...prev.orcamento,
        etapas: prev.orcamento.etapas.map((et) =>
          et.id === etapaId
            ? {
                ...et,
                servicos: et.servicos.filter((s) => s.id !== servicoId),
              }
            : et,
        ),
      },
    }))
  }

  // Manipulação do Cronograma Físico-Financeiro (Passo 4)
  const handleDistribuirCronogramaUniforme = () => {
    const n = Math.max(1, proposta.cronograma.num_periodos)
    const base = truncarMoeda2(100 / n)
    const linhaUniforme = Array(n).fill(base)
    linhaUniforme[n - 1] = arredondarMoeda2(100 - base * (n - 1))

    const novaDist: Record<string, number[]> = {}
    proposta.orcamento.etapas.forEach((et) => {
      novaDist[et.id] = [...linhaUniforme]
    })

    atualizarProposta((prev) => ({
      ...prev,
      cronograma: {
        ...prev.cronograma,
        distribuicao: novaDist,
      },
    }))
    toast.success("Cronograma distribuído uniformemente em 100% para todas as etapas!")
  }

  const handleAlterarPercentualPeriodo = (
    etapaId: string,
    idxPeriodo: number,
    novoValor: number,
  ) => {
    const n = Math.max(1, proposta.cronograma.num_periodos)
    const atual =
      proposta.cronograma.distribuicao[etapaId] ||
      resultado.cronograma.linhas.find((l) => l.etapa_id === etapaId)
        ?.percentuais_periodo ||
      Array(n).fill(0)

    const copia = Array.from({ length: n }, (_, i) => Number(atual[i]) || 0)
    copia[idxPeriodo] = Math.max(0, Math.min(100, arredondarMoeda2(novoValor)))

    atualizarProposta((prev) => ({
      ...prev,
      cronograma: {
        ...prev.cronograma,
        distribuicao: {
          ...prev.cronograma.distribuicao,
          [etapaId]: copia,
        },
      },
    }))
  }

  // Barra de ferramentas simplificada de texto rico para Observações (Passo 5)
  const inserirTagObservacoes = (snippetHtml: string) => {
    atualizarProposta((prev) => ({
      ...prev,
      condicoes: {
        ...prev.condicoes,
        observacoes_html: `${prev.condicoes.observacoes_html || ""}\n${snippetHtml}`,
      },
    }))
  }

  const progressoWizardPct = Math.round((passoAtual / PASSOS_WIZARD.length) * 100)

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden print:static print:h-auto print:bg-white print:text-slate-900 print:overflow-visible">
      {/* =====================================================================
       * BARRA SUPERIOR DE CONTROLE DO CONSTRUTOR DE PROPOSTAS (OCULTA NO PRINT)
       * =================================================================== */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden z-30">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              handleSalvarRascunhoSaaS()
              onVoltarPerfil()
            }}
            className="h-8 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200 gap-1.5"
          >
            <ArrowLeft size={14} /> Voltar ao Perfil
          </Button>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Seletor de Vínculo com Licitação do SaaS */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-400 hidden xl:inline">
              Licitação SaaS:
            </span>
            <select
              value={orcamentoAtivo.id}
              onChange={(e) => onSelecionarLicitacaoSaaS(e.target.value)}
              className="h-8 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 max-w-[230px] truncate"
              title="Selecionar licitação cadastrada no projetodemofredson"
            >
              {listaLicitacoesSaaS.map((lic) => (
                <option key={lic.id} value={lic.id}>
                  {lic.titulo || lic.edital.numero_edital || lic.id}
                </option>
              ))}
            </select>
          </div>

          {/* Botão Importar PDF do Edital */}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUploadEditalPDF(f)
              if (pdfInputRef.current) pdfInputRef.current.value = ""
            }}
            className="hidden"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isProcessingAI}
            onClick={() => pdfInputRef.current?.click()}
            className="h-8 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300 gap-1.5"
          >
            <Sparkles size={13} className="text-slate-400" />
            {isProcessingAI ? "Extraindo Edital..." : "Importar Edital PDF"}
          </Button>

          {onAlternarModoPlanilhaAnalitica && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                handleSalvarRascunhoSaaS()
                onAlternarModoPlanilhaAnalitica()
              }}
              className="h-8 text-xs text-slate-400 hover:text-slate-200 hidden md:inline-flex"
              title="Alternar para visão de Composições Analíticas CPU e Curva ABC"
            >
              <Calculator size={13} className="mr-1.5 text-slate-400" />
              Modo CPU / Curva ABC
            </Button>
          )}
        </div>

        {/* KPIs em Tempo Real + Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Alternador de Visualização Responsivo */}
          <div className="flex lg:hidden items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setLayoutMobile("wizard")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                layoutMobile === "wizard"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400"
              }`}
            >
              Formulário
            </button>
            <button
              type="button"
              onClick={() => setLayoutMobile("preview")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                layoutMobile === "preview"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400"
              }`}
            >
              Preview A4
            </button>
          </div>

          <Badge className="text-[10px] h-6 bg-slate-800/80 text-slate-300 border border-slate-700 font-normal">
            {proposta.certame.tipo_proposta === "readequada"
              ? "Proposta Readequada (Pós-Lances)"
              : "Proposta Inicial (Cadastro)"}
          </Badge>

          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-right">
            <span className="text-[9px] text-slate-400 uppercase block leading-none">
              Valor Global ({fmtPercentualBR(proposta.orcamento.bdi_normal_pct)}{" "}
              BDI)
            </span>
            <span className="text-sm font-bold font-mono text-slate-100">
              {fmtMoedaBRL(resultado.valor_global_proposta)}
            </span>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPassoAtual(3)}
            className="h-8 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300 gap-1.5"
          >
            <Gavel size={13} className="text-slate-400" /> Desconto de Disputa
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSalvarRascunhoSaaS}
            className="h-8 text-xs bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100 font-medium gap-1.5"
          >
            <Save size={13} /> Salvar Rascunho
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportarJSON}
            className="h-8 text-xs bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300 gap-1"
            title="Baixar JSON estruturado da proposta"
          >
            <Download size={13} /> JSON
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold gap-1.5"
          >
            <Printer size={13} /> Imprimir / PDF
          </Button>
        </div>
      </header>

      {/* =====================================================================
       * ÁREA PRINCIPAL SPLIT-SCREEN: WIZARD (ESQUERDA) + LIVE PREVIEW A4 (DIREITA)
       * =================================================================== */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden print:block print:overflow-visible">
        {/* ===================================================================
         * PAINEL ESQUERDO: WIZARD DE PREENCHIMENTO EM 6 PASSOS (OCULTO NO PRINT)
         * ================================================================= */}
        <aside
          className={`w-full lg:w-[50%] xl:w-[48%] h-full flex flex-col bg-slate-900/95 border-r border-slate-800 print:hidden ${
            layoutMobile === "preview" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* BARRA DE PROGRESSO E SELETOR DE ETAPAS DO WIZARD */}
          <div className="p-3.5 bg-slate-950/90 border-b border-slate-800 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider">
                  Passo {passoAtual} de {PASSOS_WIZARD.length}:
                </span>
                <span className="font-semibold text-slate-200">
                  {PASSOS_WIZARD[passoAtual - 1].subtitulo}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                {ultimoSalvoHora && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <CheckCircle2 size={12} /> Salvo às {ultimoSalvoHora}
                  </span>
                )}
                <span className="font-mono font-bold text-slate-300">
                  {progressoWizardPct}%
                </span>
              </div>
            </div>

            <Progress value={progressoWizardPct} className="h-1 bg-slate-800" />

            {/* Abas dos 6 Passos */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
              {PASSOS_WIZARD.map((p) => {
                const Icone = p.icone
                const ativo = passoAtual === p.numero
                const concluido = passoAtual > p.numero
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPassoAtual(p.numero)}
                    className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                      ativo
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : concluido
                        ? "bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800/70"
                        : "bg-slate-900/40 border-slate-800/80 text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Icone
                        size={13}
                        className={
                          ativo
                            ? "text-slate-200"
                            : concluido
                            ? "text-slate-400"
                            : "text-slate-500"
                        }
                      />
                      <span className="text-[9px] font-mono opacity-75">
                        0{p.numero}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold leading-tight line-clamp-1">
                      {p.titulo.replace(/^\d+\.\s*/, "")}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* CONTEÚDO ROLÁVEL DO PASSO ATIVO */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {/* ===============================================================
             * PASSO 1: IDENTIFICAÇÃO DO CERTAME E ÓRGÃO LICITANTE
             * ============================================================= */}
            {passoAtual === 1 && (
              <div className="space-y-4">
                {/* Seletor do Tipo de Proposta */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <FileText size={14} className="text-slate-400" /> Tipo de Proposta Comercial (Lei
                    14.133/2021)
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        atualizarProposta((prev) => ({
                          ...prev,
                          certame: {
                            ...prev.certame,
                            tipo_proposta: "inicial",
                          },
                        }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all ${
                        proposta.certame.tipo_proposta === "inicial"
                          ? "bg-slate-800/90 border-slate-600 text-slate-100"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-100">
                        Proposta Inicial (Cadastro)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Para cadastramento inicial no sistema eletrônico antes da
                        sessão pública de lances.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        atualizarProposta((prev) => ({
                          ...prev,
                          certame: {
                            ...prev.certame,
                            tipo_proposta: "readequada",
                          },
                        }))
                      }
                      className={`p-3 rounded-xl border text-left transition-all ${
                        proposta.certame.tipo_proposta === "readequada"
                          ? "bg-slate-800/90 border-slate-600 text-slate-100"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-100">
                        Proposta Readequada (Pós-Fase de Lances)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Ajustada ao lance vencedor arrematado na disputa, com
                        desconto linear aplicado aos preços unitários.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Dados do Órgão Público e Certame */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Landmark size={14} className="text-slate-400" /> Dados do Órgão Público e Certame
                    Licitatório
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Órgão Público / Entidade Licitante *
                      </Label>
                      <Input
                        value={proposta.certame.orgao}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: { ...prev.certame, orgao: e.target.value },
                          }))
                        }
                        placeholder="Ex: Secretaria de Estado da Infraestrutura — SEINFRA / Prefeitura Municipal"
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Nº Interno da Proposta
                      </Label>
                      <Input
                        value={proposta.certame.numero_proposta}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              numero_proposta: e.target.value,
                            },
                          }))
                        }
                        placeholder="PROP-2026-001"
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Modalidade da Licitação
                      </Label>
                      <select
                        value={proposta.certame.modalidade}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              modalidade: e.target.value,
                            },
                          }))
                        }
                        className="w-full h-9 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100"
                      >
                        {MODALIDADES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Número do Edital *
                      </Label>
                      <Input
                        value={proposta.certame.numero_edital}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              numero_edital: e.target.value,
                            },
                          }))
                        }
                        placeholder="Ex: 012/2026"
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Nº do Processo Administrativo
                      </Label>
                      <Input
                        value={proposta.certame.numero_processo}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              numero_processo: e.target.value,
                            },
                          }))
                        }
                        placeholder="Ex: 2026.000145/SEINFRA"
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Portal de Compras
                      </Label>
                      <select
                        value={proposta.certame.portal}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              portal: e.target.value,
                            },
                          }))
                        }
                        className="w-full h-9 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100"
                      >
                        {PORTAIS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Código UASG / Identificador
                      </Label>
                      <Input
                        value={proposta.certame.uasg}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: { ...prev.certame, uasg: e.target.value },
                          }))
                        }
                        placeholder="Ex: 989001"
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Data e Hora da Sessão Pública
                      </Label>
                      <Input
                        type="datetime-local"
                        value={proposta.certame.data_sessao}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              data_sessao: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Aos Cuidados de (A/C)
                      </Label>
                      <Input
                        value={proposta.certame.agente_contratacao}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              agente_contratacao: e.target.value,
                            },
                          }))
                        }
                        placeholder="Agente de Contratação / Comissão de Contratação"
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Município / UF do Local da Obra
                      </Label>
                      <Input
                        value={proposta.certame.municipio_uf}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            certame: {
                              ...prev.certame,
                              municipio_uf: e.target.value,
                            },
                          }))
                        }
                        placeholder="Ex: Anápolis/GO"
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">
                      Objeto Detalhado da Obra / Serviço de Engenharia *
                    </Label>
                    <Textarea
                      value={proposta.certame.objeto}
                      onChange={(e) =>
                        atualizarProposta((prev) => ({
                          ...prev,
                          certame: { ...prev.certame, objeto: e.target.value },
                        }))
                      }
                      placeholder="Descreva integralmente o objeto da licitação conforme o Edital e o Projeto Básico..."
                      className="min-h-[85px] text-xs bg-slate-900 border-slate-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
             * PASSO 2: DADOS DA EMPRESA PROPONENTE E RESPONSÁVEL TÉCNICO
             * ============================================================= */}
            {passoAtual === 2 && (
              <div className="space-y-4">
                {/* Dados da Construtora / Empresa de Engenharia */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Building2 size={14} className="text-slate-400" /> Dados da Construtora / Empresa
                      Proponente
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        atualizarProposta((prev) => ({
                          ...prev,
                          proponente: {
                            ...prev.proponente,
                            razao_social: perfilCliente.empresa,
                            cnpj: perfilCliente.cnpj,
                            telefone: perfilCliente.telefone,
                            email: perfilCliente.email,
                            cidade_uf: perfilCliente.cidade_uf,
                            representante: {
                              ...prev.proponente.representante,
                              nome: perfilCliente.nome,
                              cargo: perfilCliente.cargo,
                            },
                            responsavel_tecnico: {
                              ...prev.proponente.responsavel_tecnico,
                              nome: perfilCliente.responsavel_tecnico,
                            },
                          },
                        }))
                        toast.success("Dados preenchidos a partir do seu Perfil do SaaS!")
                      }}
                      className="h-7 text-[11px] text-slate-300 hover:text-white"
                    >
                      Puxar do Perfil SaaS
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Razão Social da Licitante *
                      </Label>
                      <Input
                        value={proposta.proponente.razao_social}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              razao_social: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">CNPJ *</Label>
                      <Input
                        value={proposta.proponente.cnpj}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              cnpj: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Inscrição Estadual
                      </Label>
                      <Input
                        value={proposta.proponente.inscricao_estadual}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              inscricao_estadual: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Inscrição Municipal
                      </Label>
                      <Input
                        value={proposta.proponente.inscricao_municipal}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              inscricao_municipal: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Telefone Corporativo
                      </Label>
                      <Input
                        value={proposta.proponente.telefone}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              telefone: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        E-mail Oficial
                      </Label>
                      <Input
                        value={proposta.proponente.email}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              email: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Endereço Completo da Sede
                      </Label>
                      <Input
                        value={proposta.proponente.endereco}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              endereco: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">CEP</Label>
                      <Input
                        value={proposta.proponente.cep}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              cep: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Cidade / UF
                      </Label>
                      <Input
                        value={proposta.proponente.cidade_uf}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              cidade_uf: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Dados Bancários para Pagamento / Empenho */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Landmark size={14} className="text-slate-400" /> Dados Bancários para Empenho e
                    Pagamento
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Banco (Código e Nome)
                      </Label>
                      <Input
                        value={proposta.proponente.banco.banco}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              banco: {
                                ...prev.proponente.banco,
                                banco: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="001 — Banco do Brasil"
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Agência
                      </Label>
                      <Input
                        value={proposta.proponente.banco.agencia}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              banco: {
                                ...prev.proponente.banco,
                                agencia: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="1234-5"
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Conta Corrente
                      </Label>
                      <Input
                        value={proposta.proponente.banco.conta}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              banco: {
                                ...prev.proponente.banco,
                                conta: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="98765-4"
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Chave PIX Corporativa
                      </Label>
                      <Input
                        value={proposta.proponente.banco.pix}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            proponente: {
                              ...prev.proponente,
                              banco: {
                                ...prev.proponente.banco,
                                pix: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="CNPJ ou E-mail"
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Representante Legal e Responsável Técnico */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <UserCheck size={14} className="text-slate-400" /> Representante Legal
                    </Label>
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">
                          Nome Completo *
                        </Label>
                        <Input
                          value={proposta.proponente.representante.nome}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              proponente: {
                                ...prev.proponente,
                                representante: {
                                  ...prev.proponente.representante,
                                  nome: e.target.value,
                                },
                              },
                            }))
                          }
                          className="h-8 text-xs bg-slate-900 border-slate-700"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            CPF *
                          </Label>
                          <Input
                            value={proposta.proponente.representante.cpf}
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  representante: {
                                    ...prev.proponente.representante,
                                    cpf: e.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="000.000.000-00"
                            className="h-8 text-xs bg-slate-900 border-slate-700 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            Cargo / Função
                          </Label>
                          <Input
                            value={proposta.proponente.representante.cargo}
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  representante: {
                                    ...prev.proponente.representante,
                                    cargo: e.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="Sócio-Administrador"
                            className="h-8 text-xs bg-slate-900 border-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <HardHat size={14} className="text-slate-400" /> Responsável Técnico pela Obra
                    </Label>
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            Nome do Profissional *
                          </Label>
                          <Input
                            value={proposta.proponente.responsavel_tecnico.nome}
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  responsavel_tecnico: {
                                    ...prev.proponente.responsavel_tecnico,
                                    nome: e.target.value,
                                  },
                                },
                              }))
                            }
                            className="h-8 text-xs bg-slate-900 border-slate-700"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            Título Profissional
                          </Label>
                          <select
                            value={
                              proposta.proponente.responsavel_tecnico.titulo
                            }
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  responsavel_tecnico: {
                                    ...prev.proponente.responsavel_tecnico,
                                    titulo: e.target.value,
                                  },
                                },
                              }))
                            }
                            className="w-full h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                          >
                            {TITULOS_PROFISSIONAIS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            Conselho
                          </Label>
                          <select
                            value={
                              proposta.proponente.responsavel_tecnico.conselho
                            }
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  responsavel_tecnico: {
                                    ...prev.proponente.responsavel_tecnico,
                                    conselho: e.target.value as any,
                                  },
                                },
                              }))
                            }
                            className="w-full h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                          >
                            <option value="CREA">CREA</option>
                            <option value="CAU">CAU</option>
                            <option value="CFT">CFT</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            Nº Registro *
                          </Label>
                          <Input
                            value={
                              proposta.proponente.responsavel_tecnico.registro
                            }
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  responsavel_tecnico: {
                                    ...prev.proponente.responsavel_tecnico,
                                    registro: e.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="102030/D"
                            className="h-8 text-xs bg-slate-900 border-slate-700 font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-300">
                            UF
                          </Label>
                          <select
                            value={proposta.proponente.responsavel_tecnico.uf}
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                proponente: {
                                  ...prev.proponente,
                                  responsavel_tecnico: {
                                    ...prev.proponente.responsavel_tecnico,
                                    uf: e.target.value,
                                  },
                                },
                              }))
                            }
                            className="w-full h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                          >
                            {UFS.map((uf) => (
                              <option key={uf} value={uf}>
                                {uf}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
             * PASSO 3: PLANILHA ORÇAMENTÁRIA, BDI E MODO DISPUTA (TCU)
             * ============================================================= */}
            {passoAtual === 3 && (
              <div className="space-y-4">
                {/* Configuração de BDI, Encargos Sociais e Regra de Arredondamento TCU */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Calculator size={14} className="text-slate-400" /> Parâmetros de BDI (Acórdão
                      2.622/2013-TCU) e Encargos Sociais
                    </Label>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-slate-300">
                        Folha Desonerada (CPRB)
                      </Label>
                      <Switch
                        checked={proposta.orcamento.desonerado}
                        onCheckedChange={(v) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            orcamento: { ...prev.orcamento, desonerado: v },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-400">
                        BDI Normal (%)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={proposta.orcamento.bdi_normal_pct}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            orcamento: {
                              ...prev.orcamento,
                              bdi_normal_pct: parseFloat(e.target.value) || 0,
                            },
                          }))
                        }
                        className="h-8 text-xs bg-slate-900 border-slate-700 font-mono text-slate-100 font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-slate-400">
                          BDI Diferenc. (%)
                        </Label>
                        <input
                          type="checkbox"
                          checked={proposta.orcamento.usar_bdi_diferenciado}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              orcamento: {
                                ...prev.orcamento,
                                usar_bdi_diferenciado: e.target.checked,
                              },
                            }))
                          }
                          title="Ativar BDI Diferenciado para Equipamentos/Materiais"
                        />
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        disabled={!proposta.orcamento.usar_bdi_diferenciado}
                        value={proposta.orcamento.bdi_diferenciado_pct}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            orcamento: {
                              ...prev.orcamento,
                              bdi_diferenciado_pct:
                                parseFloat(e.target.value) || 0,
                            },
                          }))
                        }
                        className="h-8 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-400">
                        Enc. Horista (%)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={proposta.orcamento.encargos_horista_pct}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            orcamento: {
                              ...prev.orcamento,
                              encargos_horista_pct:
                                parseFloat(e.target.value) || 0,
                            },
                          }))
                        }
                        className="h-8 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-400">
                        Enc. Mensalista (%)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={proposta.orcamento.encargos_mensalista_pct}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            orcamento: {
                              ...prev.orcamento,
                              encargos_mensalista_pct:
                                parseFloat(e.target.value) || 0,
                            },
                          }))
                        }
                        className="h-8 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 space-y-1">
                      <Label className="text-[10px] text-slate-400">
                        Regra 2 Casas TCU
                      </Label>
                      <select
                        value={proposta.orcamento.arredondamento}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            orcamento: {
                              ...prev.orcamento,
                              arredondamento: e.target.value as any,
                            },
                          }))
                        }
                        className="w-full h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                      >
                        <option value="truncar">Truncar (SINAPI)</option>
                        <option value="arredondar">Arredondar (ABNT)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SIMULADOR DE LANCE / READEQUAÇÃO DE DISPUTA */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Gavel size={14} className="text-slate-400" /> Simulador de Lance e Readequação de
                        Disputa (Pós-Fase de Lances)
                      </Label>
                      <p className="text-[11px] text-slate-400">
                        Recalcula automaticamente todos os preços unitários sem
                        gerar dízimas (2 casas decimais TCU), fechando com o
                        valor do lance vencedor.
                      </p>
                    </div>
                    <Badge className="bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px]">
                      Inicial: {fmtMoedaBRL(resultado.valor_global_inicial)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-4 space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Modo de Readequação
                      </Label>
                      <select
                        value={modoDisputa}
                        onChange={(e) => setModoDisputa(e.target.value as any)}
                        className="w-full h-9 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100 font-medium"
                      >
                        <option value="valor">
                          Por Valor Global Arrematado (R$)
                        </option>
                        <option value="percentual">
                          Por Desconto Linear (%)
                        </option>
                      </select>
                    </div>

                    {modoDisputa === "valor" ? (
                      <div className="sm:col-span-4 space-y-1">
                        <Label className="text-[11px] text-slate-300">
                          Valor Global Arrematado na Disputa (R$)
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={inputValorArrematado}
                          onChange={(e) =>
                            setInputValorArrematado(e.target.value)
                          }
                          placeholder="Ex: 58500.00"
                          className="h-9 text-xs bg-slate-900 border-slate-700 font-mono text-slate-100 font-bold"
                        />
                      </div>
                    ) : (
                      <div className="sm:col-span-4 space-y-1">
                        <Label className="text-[11px] text-slate-300">
                          Percentual de Desconto Linear (%)
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={inputDescontoPct}
                          onChange={(e) => setInputDescontoPct(e.target.value)}
                          placeholder="Ex: 7.50"
                          className="h-9 text-xs bg-slate-900 border-slate-700 font-mono text-slate-100 font-bold"
                        />
                      </div>
                    )}

                    <div className="sm:col-span-4 flex gap-2">
                      <Button
                        type="button"
                        onClick={handleAplicarDisputa}
                        className="flex-1 h-9 bg-slate-200 hover:bg-white text-slate-900 font-semibold text-xs gap-1.5"
                      >
                        <Gavel size={13} /> Recalcular Planilha
                      </Button>
                      {proposta.orcamento.disputa.aplicada && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleRestaurarPrecosIniciais}
                          className="h-9 px-2.5 border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs"
                          title="Restaurar preços iniciais sem desconto"
                        >
                          <RotateCcw size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* VALOR GLOBAL POR EXTENSO AUTOMÁTICO */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">
                      Valor Global por Extenso (Gerado Automaticamente):
                    </span>
                    <span className="text-slate-100 font-semibold">
                      {fmtMoedaBRL(resultado.valor_global_proposta)} — (
                      {resultado.valor_por_extenso})
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAdicionarEtapa}
                    className="h-8 text-xs bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 font-medium shrink-0 gap-1"
                  >
                    <Plus size={13} /> Nova Etapa da Obra
                  </Button>
                </div>

                {/* TABELA DINÂMICA DE ETAPAS E ITENS DA PLANILHA */}
                <div className="space-y-3">
                  {resultado.etapas.map((etCalc) => (
                    <div
                      key={etCalc.etapa.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden"
                    >
                      {/* Cabeçalho da Etapa */}
                      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                          <Badge className="bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs">
                            Etapa {etCalc.item_etapa}
                          </Badge>
                          <Input
                            value={etCalc.etapa.descricao}
                            onChange={(e) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                orcamento: {
                                  ...prev.orcamento,
                                  etapas: prev.orcamento.etapas.map((x) =>
                                    x.id === etCalc.etapa.id
                                      ? { ...x, descricao: e.target.value }
                                      : x,
                                  ),
                                },
                              }))
                            }
                            className="h-7 text-xs font-bold bg-slate-950 border-slate-700 uppercase"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-200">
                            Subtotal: {fmtMoedaBRL(etCalc.subtotal_com_bdi)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleAdicionarServico(etCalc.etapa.id)
                            }
                            className="h-7 px-2 text-[11px] bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                          >
                            <Plus size={12} /> Item
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoverEtapa(etCalc.etapa.id)}
                            className="h-7 px-2 text-slate-400 hover:text-red-400"
                            title="Remover Etapa"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>

                      {/* Itens da Etapa */}
                      <div className="divide-y divide-slate-800/80">
                        {etCalc.itens.map((it) => (
                          <div
                            key={it.servico.id}
                            className="p-3 space-y-2 hover:bg-slate-900/40 transition-colors"
                          >
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-2 sm:col-span-1">
                                <span className="text-[10px] font-mono font-bold text-slate-400 block">
                                  #{it.item_hierarquia}
                                </span>
                              </div>

                              <div className="col-span-5 sm:col-span-2">
                                <select
                                  value={it.servico.fonte}
                                  onChange={(e) =>
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      {
                                        fonte: e.target
                                          .value as FonteReferencia,
                                      },
                                    )
                                  }
                                  className="w-full h-7 rounded border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-200"
                                >
                                  {FONTES_REFERENCIA.map((f) => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="col-span-5 sm:col-span-2">
                                <Input
                                  value={it.servico.codigo}
                                  onChange={(e) =>
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      { codigo: e.target.value },
                                    )
                                  }
                                  placeholder="Código"
                                  className="h-7 text-[11px] font-mono bg-slate-900 border-slate-700"
                                />
                              </div>

                              <div className="col-span-10 sm:col-span-6">
                                <Input
                                  value={it.servico.descricao}
                                  onChange={(e) =>
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      { descricao: e.target.value },
                                    )
                                  }
                                  placeholder="Descrição técnica do serviço..."
                                  className="h-7 text-xs bg-slate-900 border-slate-700"
                                />
                              </div>

                              <div className="col-span-2 sm:col-span-1 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoverServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                    )
                                  }
                                  className="text-slate-500 hover:text-red-400 p-1"
                                  title="Excluir item"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center pt-1">
                              <div>
                                <Label className="text-[9.5px] text-slate-400">
                                  Unidade
                                </Label>
                                <select
                                  value={it.servico.unidade}
                                  onChange={(e) =>
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      { unidade: e.target.value },
                                    )
                                  }
                                  className="w-full h-7 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
                                >
                                  {UNIDADES_MEDIDA.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <Label className="text-[9.5px] text-slate-400">
                                  Quantidade
                                </Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={it.servico.quantidade}
                                  onChange={(e) =>
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      {
                                        quantidade:
                                          parseFloat(e.target.value) || 0,
                                      },
                                    )
                                  }
                                  className="h-7 text-xs font-mono bg-slate-900 border-slate-700 text-right"
                                />
                              </div>

                              <div>
                                <Label className="text-[9.5px] text-slate-400">
                                  Custo Unit. S/ BDI (R$)
                                </Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={it.servico.custo_unitario}
                                  onChange={(e) =>
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      {
                                        custo_unitario:
                                          parseFloat(e.target.value) || 0,
                                        preco_readequado: null,
                                      },
                                    )
                                  }
                                  className="h-7 text-xs font-mono bg-slate-900 border-slate-700 text-right"
                                />
                              </div>

                              <div>
                                <Label className="text-[9.5px] text-slate-300">
                                  Valor Unit. C/ BDI (R$)
                                </Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={it.preco_unitario_com_bdi}
                                  onChange={(e) => {
                                    const novoPu =
                                      parseFloat(e.target.value) || 0
                                    const bdi = it.bdi_aplicado_pct
                                    const novoCusto = arredondarMoeda2(
                                      novoPu / (1 + bdi / 100),
                                    )
                                    handleAtualizarServico(
                                      etCalc.etapa.id,
                                      it.servico.id,
                                      {
                                        custo_unitario: novoCusto,
                                        preco_readequado: proposta.orcamento
                                          .disputa.aplicada
                                          ? novoPu
                                          : null,
                                      },
                                    )
                                  }}
                                  className="h-7 text-xs font-mono bg-slate-900 border-slate-700 text-slate-100 font-bold text-right"
                                />
                              </div>

                              <div className="col-span-2 sm:col-span-1 text-right bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800">
                                <span className="text-[9px] text-slate-400 block">
                                  Valor Total do Item
                                </span>
                                <span className="text-xs font-mono font-bold text-white">
                                  {fmtMoedaBRL(it.total_item)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===============================================================
             * PASSO 4: CRONOGRAMA FÍSICO-FINANCEIRO
             * ============================================================= */}
            {passoAtual === 4 && (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-400" /> Configuração de Períodos do
                        Cronograma Físico-Financeiro
                      </Label>
                      <p className="text-[11px] text-slate-400">
                        Defina o percentual de avanço físico (%) de cada etapa
                        por período. O desembolso em R$ é calculado
                        automaticamente.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleDistribuirCronogramaUniforme}
                      className="h-8 text-xs bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                    >
                      Distribuir Uniformemente (100%)
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Unidade de Período do Cronograma
                      </Label>
                      <select
                        value={proposta.cronograma.rotulo_periodo}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            cronograma: {
                              ...prev.cronograma,
                              rotulo_periodo: e.target.value as any,
                            },
                          }))
                        }
                        className="w-full h-9 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-100"
                      >
                        {ROTULOS_PERIODO.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Quantidade de Períodos (Ex.: Meses)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={36}
                        value={proposta.cronograma.num_periodos}
                        onChange={(e) => {
                          const qtd = Math.max(
                            1,
                            Math.min(36, parseInt(e.target.value) || 1),
                          )
                          atualizarProposta((prev) => ({
                            ...prev,
                            cronograma: {
                              ...prev.cronograma,
                              num_periodos: qtd,
                            },
                          }))
                        }}
                        className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Grade Editável de Distribuição por Etapa */}
                <div className="space-y-3">
                  {resultado.cronograma.linhas.map((linha) => {
                    const fechou100 =
                      Math.abs(linha.soma_percentual - 100) <= 0.05
                    return (
                      <div
                        key={linha.etapa_id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-white">
                              {linha.item_etapa}. {linha.descricao}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-2 font-mono">
                              ({fmtMoedaBRL(linha.valor_etapa)} • Peso:{" "}
                              {fmtPercentualBR(linha.peso_etapa_pct, 1)})
                            </span>
                          </div>
                          <Badge
                            className={`font-mono text-[10px] ${
                              fechou100
                                ? "bg-slate-800 text-slate-200 border border-slate-700"
                                : "bg-red-950/60 text-red-300 border border-red-800/60"
                            }`}
                          >
                            Soma: {fmtPercentualBR(linha.soma_percentual)}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {linha.percentuais_periodo.map((pct, pIdx) => (
                            <div
                              key={pIdx}
                              className="bg-slate-900 border border-slate-800 rounded-lg p-2 space-y-1"
                            >
                              <Label className="text-[10px] text-slate-400 block">
                                {resultado.cronograma.rotulo_periodo} {pIdx + 1}{" "}
                                (%)
                              </Label>
                              <Input
                                type="number"
                                step="0.5"
                                min={0}
                                max={100}
                                value={pct}
                                onChange={(e) =>
                                  handleAlterarPercentualPeriodo(
                                    linha.etapa_id,
                                    pIdx,
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="h-7 text-xs font-mono bg-slate-950 border-slate-700 text-right"
                              />
                              <div className="text-[10px] font-mono text-slate-300 text-right">
                                {fmtMoedaBRL(linha.valores_periodo[pIdx])}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===============================================================
             * PASSO 5: CONDIÇÕES COMERCIAIS E DECLARAÇÕES LEGAIS (LEI 14.133/2021)
             * ============================================================= */}
            {passoAtual === 5 && (
              <div className="space-y-4">
                {/* Prazos e Condições de Pagamento */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Scale size={14} className="text-slate-400" /> Prazos de Validade, Execução e Garantia
                    Qüinqüenal
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Validade da Proposta (Dias)
                      </Label>
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={proposta.condicoes.validade_dias}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                validade_dias: parseInt(e.target.value) || 60,
                              },
                            }))
                          }
                          className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                validade_dias: 60,
                              },
                            }))
                          }
                          className="h-9 px-2 text-[10px] bg-slate-900 border-slate-700"
                        >
                          60d
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                validade_dias: 90,
                              },
                            }))
                          }
                          className="h-9 px-2 text-[10px] bg-slate-900 border-slate-700"
                        >
                          90d
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Prazo de Execução da Obra
                      </Label>
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={proposta.condicoes.prazo_execucao}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                prazo_execucao: parseInt(e.target.value) || 1,
                              },
                            }))
                          }
                          className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                        />
                        <select
                          value={proposta.condicoes.prazo_execucao_unidade}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                prazo_execucao_unidade: e.target.value as any,
                              },
                            }))
                          }
                          className="h-9 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                        >
                          <option value="dias">Dias</option>
                          <option value="meses">Meses</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Garantia Legal (Art. 618 CC)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={proposta.condicoes.prazo_garantia_anos}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                prazo_garantia_anos:
                                  parseInt(e.target.value) || 5,
                              },
                            }))
                          }
                          className="h-9 text-xs bg-slate-900 border-slate-700 font-mono"
                        />
                        <span className="text-xs text-slate-400 shrink-0">
                          Anos
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">
                      Condições de Medição e Pagamento
                    </Label>
                    <Textarea
                      value={proposta.condicoes.condicoes_pagamento}
                      onChange={(e) =>
                        atualizarProposta((prev) => ({
                          ...prev,
                          condicoes: {
                            ...prev.condicoes,
                            condicoes_pagamento: e.target.value,
                          },
                        }))
                      }
                      className="min-h-[60px] text-xs bg-slate-900 border-slate-700"
                    />
                  </div>
                </div>

                {/* Checkboxes de Declarações Obrigatórias da Lei Federal nº 14.133/2021 */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-slate-400" /> Declarações Legais Obrigatórias
                    (Lei Federal nº 14.133/2021)
                  </Label>

                  <div className="space-y-2.5">
                    {DECLARACOES_LEI_14133.map((decl) => {
                      const marcada =
                        proposta.condicoes.declaracoes[decl.chave] === true
                      return (
                        <div
                          key={decl.chave}
                          onClick={() =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              condicoes: {
                                ...prev.condicoes,
                                declaracoes: {
                                  ...prev.condicoes.declaracoes,
                                  [decl.chave]: !marcada,
                                },
                              },
                            }))
                          }
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                            marcada
                              ? "bg-slate-900 border-slate-700"
                              : "bg-slate-900/40 border-slate-800/80 opacity-60"
                          }`}
                        >
                          <Checkbox
                            checked={marcada}
                            onCheckedChange={(v) =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                condicoes: {
                                  ...prev.condicoes,
                                  declaracoes: {
                                    ...prev.condicoes.declaracoes,
                                    [decl.chave]: Boolean(v),
                                  },
                                },
                              }))
                            }
                            className="mt-0.5"
                          />
                          <div className="space-y-0.5 text-xs">
                            <div className="font-bold text-slate-100">
                              {decl.titulo}{" "}
                              <span className="text-[10px] font-mono text-slate-400">
                                ({decl.fundamentoLegal})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {decl.texto}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Editor de Texto Rico Simplificado para Observações Adicionais */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Observações Complementares / Exigências Específicas do
                      Edital
                    </Label>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          inserirTagObservacoes(
                            "<p><strong>Observação Técnica:</strong> Execução rigorosamente conforme normas técnicas vigentes da ABNT.</p>",
                          )
                        }
                        className="h-7 px-2 text-[10px] bg-slate-900 border-slate-700"
                      >
                        <Bold size={11} className="mr-1" /> Cláusula ABNT
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          inserirTagObservacoes(
                            "<ul><li>Mobilização imediata após emissão da Ordem de Serviço;</li><li>Fornecimento de ART/RRT de execução antes do início das obras.</li></ul>",
                          )
                        }
                        className="h-7 px-2 text-[10px] bg-slate-900 border-slate-700"
                      >
                        <List size={11} className="mr-1" /> Lista de Itens
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={proposta.condicoes.observacoes_html}
                    onChange={(e) =>
                      atualizarProposta((prev) => ({
                        ...prev,
                        condicoes: {
                          ...prev.condicoes,
                          observacoes_html: e.target.value,
                        },
                      }))
                    }
                    placeholder="Insira observações adicionais ou cláusulas específicas do edital (suporta tags HTML simples como <p>, <strong>, <ul>, <li>)..."
                    className="min-h-[90px] text-xs bg-slate-900 border-slate-700 font-mono"
                  />
                </div>
              </div>
            )}

            {/* ===============================================================
             * PASSO 6: IDENTIDADE VISUAL, ASSINATURA E FECHAMENTO
             * ============================================================= */}
            {passoAtual === 6 && (
              <div className="space-y-4">
                {/* Upload de Logotipo e Cor Primária */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Palette size={14} className="text-slate-400" /> Logotipo da Empresa Proponente e Cor
                    Institucional A4
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Upload Logotipo */}
                    <div className="space-y-2">
                      <Label className="text-[11px] text-slate-300">
                        Logotipo da Construtora / Empresa (Cabeçalho A4)
                      </Label>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            converterImagemParaDataUrl(file, (url) => {
                              atualizarProposta((prev) => ({
                                ...prev,
                                identidade: {
                                  ...prev.identidade,
                                  logo_data_url: url,
                                },
                              }))
                              toast.success("Logotipo aplicado ao cabeçalho A4!")
                            })
                          }
                        }}
                        className="hidden"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                          className="h-9 text-xs bg-slate-900 border-slate-700 text-slate-200 gap-1.5"
                        >
                          <Upload size={13} /> Enviar Logotipo (PNG/JPG)
                        </Button>
                        {proposta.identidade.logo_data_url && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                identidade: {
                                  ...prev.identidade,
                                  logo_data_url: null,
                                },
                              }))
                            }
                            className="h-9 text-xs text-red-400"
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Cor Primária das Tabelas */}
                    <div className="space-y-2">
                      <Label className="text-[11px] text-slate-300">
                        Cor Primária dos Cabeçalhos e Tabelas A4
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {CORES_CORPORATIVAS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() =>
                              atualizarProposta((prev) => ({
                                ...prev,
                                identidade: {
                                  ...prev.identidade,
                                  cor_primaria: c.hex,
                                },
                              }))
                            }
                            className={`w-7 h-7 rounded-full border-2 transition-transform ${
                              proposta.identidade.cor_primaria === c.hex
                                ? "border-white scale-110"
                                : "border-transparent opacity-80 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.nome}
                          />
                        ))}
                        <input
                          type="color"
                          value={proposta.identidade.cor_primaria}
                          onChange={(e) =>
                            atualizarProposta((prev) => ({
                              ...prev,
                              identidade: {
                                ...prev.identidade,
                                cor_primaria: e.target.value,
                              },
                            }))
                          }
                          className="h-7 w-9 bg-transparent border-0 cursor-pointer"
                          title="Escolher cor personalizada"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Local e Data do Documento */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Local e Data de Emissão da Proposta
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Cidade / UF de Emissão
                      </Label>
                      <Input
                        value={proposta.identidade.local}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            identidade: {
                              ...prev.identidade,
                              local: e.target.value,
                            },
                          }))
                        }
                        placeholder="Ex: Goiânia/GO"
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300">
                        Data da Proposta
                      </Label>
                      <Input
                        type="date"
                        disabled={proposta.identidade.data_automatica}
                        value={proposta.identidade.data_documento}
                        onChange={(e) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            identidade: {
                              ...prev.identidade,
                              data_documento: e.target.value,
                            },
                          }))
                        }
                        className="h-9 text-xs bg-slate-900 border-slate-700"
                      />
                    </div>

                    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 h-9">
                      <span className="text-xs text-slate-300">
                        Usar Data Atual Automática
                      </span>
                      <Switch
                        checked={proposta.identidade.data_automatica}
                        onCheckedChange={(v) =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            identidade: {
                              ...prev.identidade,
                              data_automatica: v,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Configuração do Bloco Duplo de Assinaturas */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Modalidade de Assinatura (Representante Legal + Responsável
                    Técnico CREA/CAU)
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      {
                        id: "digital",
                        titulo: "Assinatura Digital ICP-Brasil / Gov.br",
                        desc: "Insere chancela formal de certificação digital ICP-Brasil e CREA/CAU.",
                      },
                      {
                        id: "imagem",
                        titulo: "Inserir Imagem de Rubrica / Assinatura",
                        desc: "Permite enviar a imagem PNG/JPG da assinatura de cada signatário.",
                      },
                      {
                        id: "manuscrita",
                        titulo: "Assinatura Física / Manuscrita",
                        desc: "Deixa o espaço limpo sobre a linha para assinatura física ou carimbo.",
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          atualizarProposta((prev) => ({
                            ...prev,
                            identidade: {
                              ...prev.identidade,
                              assinatura_modo: m.id as any,
                            },
                          }))
                        }
                        className={`p-3 rounded-xl border text-left transition-all ${
                          proposta.identidade.assinatura_modo === m.id
                            ? "bg-slate-800/90 border-slate-600 text-slate-100"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50"
                        }`}
                      >
                        <div className="font-bold text-xs text-white">
                          {m.titulo}
                        </div>
                        <p className="text-[10.5px] text-slate-400 mt-1">
                          {m.desc}
                        </p>
                      </button>
                    ))}
                  </div>

                  {proposta.identidade.assinatura_modo === "imagem" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-slate-300">
                          Rubrica do Representante Legal
                        </Label>
                        <input
                          ref={assRepInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) {
                              converterImagemParaDataUrl(f, (url) =>
                                atualizarProposta((prev) => ({
                                  ...prev,
                                  identidade: {
                                    ...prev.identidade,
                                    assinatura_representante_url: url,
                                  },
                                })),
                              )
                            }
                          }}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => assRepInputRef.current?.click()}
                          className="w-full h-8 text-xs bg-slate-900 border-slate-700"
                        >
                          <Upload size={12} className="mr-1.5" /> Enviar
                          Assinatura Representante
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-slate-300">
                          Rubrica do Responsável Técnico (CREA/CAU)
                        </Label>
                        <input
                          ref={assRtInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) {
                              converterImagemParaDataUrl(f, (url) =>
                                atualizarProposta((prev) => ({
                                  ...prev,
                                  identidade: {
                                    ...prev.identidade,
                                    assinatura_responsavel_url: url,
                                  },
                                })),
                              )
                            }
                          }}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => assRtInputRef.current?.click()}
                          className="w-full h-8 text-xs bg-slate-900 border-slate-700"
                        >
                          <Upload size={12} className="mr-1.5" /> Enviar
                          Assinatura Resp. Técnico
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RODAPÉ DE NAVEGAÇÃO ENTRE OS PASSOS DO WIZARD */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={passoAtual <= 1}
              onClick={() => setPassoAtual((p) => Math.max(1, p - 1))}
              className="h-9 text-xs bg-slate-900 border-slate-700 text-slate-200 gap-1.5"
            >
              <ArrowLeft size={14} /> Passo Anterior
            </Button>

            <span className="text-[11px] text-slate-400 hidden sm:inline">
              As alterações atualizam a Folha A4 instantaneamente →
            </span>

            {passoAtual < PASSOS_WIZARD.length ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setPassoAtual((p) => Math.min(PASSOS_WIZARD.length, p + 1))
                }
                className="h-9 text-xs bg-slate-200 hover:bg-white text-slate-900 font-semibold gap-1.5"
              >
                Próximo Passo <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  handleSalvarRascunhoSaaS()
                  window.print()
                }}
                className="h-9 text-xs bg-slate-200 hover:bg-white text-slate-900 font-bold gap-1.5"
              >
                <Printer size={14} /> Finalizar e Imprimir / PDF A4
              </Button>
            )}
          </div>
        </aside>

        {/* ===================================================================
         * PAINEL DIREITO: LIVE PREVIEW EM FOLHA A4 MULTI-PÁGINAS
         * ================================================================= */}
        <section
          className={`flex-1 h-full flex flex-col bg-slate-950 overflow-hidden print:block print:h-auto print:bg-white print:overflow-visible ${
            layoutMobile === "wizard" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Barra de Controle do Preview A4 (Oculta na impressão) */}
          <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-slate-400" />
              <span className="font-bold text-slate-200">
                Live Preview • Folha A4 Oficial (210mm × 297mm)
              </span>
              <Badge
                variant="outline"
                className="text-[10px] border-slate-700 text-slate-400"
              >
                Atualização em Tempo Real
              </Badge>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setZoomA4((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))
                }
                className="h-7 px-2 text-slate-300 hover:text-white"
                title="Diminuir Zoom"
              >
                <ZoomOut size={14} />
              </Button>
              <span className="font-mono text-[11px] text-slate-300 w-12 text-center">
                {Math.round(zoomA4 * 100)}%
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setZoomA4((z) => Math.min(1.3, Number((z + 0.1).toFixed(2))))
                }
                className="h-7 px-2 text-slate-300 hover:text-white"
                title="Aumentar Zoom"
              >
                <ZoomIn size={14} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setZoomA4(0.85)}
                className="h-7 px-2 text-[10px] bg-slate-950 border-slate-700 text-slate-300"
              >
                Ajustar
              </Button>
            </div>
          </div>

          {/* Área de Rolagem das Folhas A4 */}
          <div className="flex-1 overflow-auto bg-slate-950/90 print:bg-white print:overflow-visible">
            <PropostaA4Preview
              proposta={proposta}
              resultado={resultado}
              zoom={zoomA4}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

