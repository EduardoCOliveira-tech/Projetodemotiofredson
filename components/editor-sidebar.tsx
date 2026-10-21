"use client"

import React, { useState, useRef } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  Sparkles,
  FileText,
  Percent,
  TrendingDown,
  Database,
  Upload,
  RefreshCw,
  AlertCircle,
  LayoutTemplate,
  Plus,
  Trash2,
  Building2
} from "lucide-react"

import type {
  OrcamentoLicita,
  BaseReferencia,
  CatalogoBase,
  FonteBase,
  InsumoModificado,
  ModeloBaseConfig
} from "@/lib/proposal-types"
import {
  fmtBRL,
  fmtPct,
  definirDesagioInsumo,
  aplicarDescontoLinear,
  MODELO_BASE_PADRAO,
  redimensionarCronograma,
  type ResultadoOrcamento
} from "@/lib/budget-engine"
import {
  parsePlanilhaInsumos,
  parsePlanilhaComposicoes,
  importarBaseEmLote,
  type RegimePreco
} from "@/lib/firebase-bases"
import { toast } from "sonner"

interface EditorSidebarProps {
  orcamento: OrcamentoLicita
  resultado: ResultadoOrcamento
  baseReferencia: BaseReferencia
  catalogoBases: CatalogoBase[]
  onUpdateOrcamento: (orc: OrcamentoLicita) => void
  onUploadEditalPDF: (file: File) => Promise<void>
  onMigrarBase: (novaBaseId: string) => Promise<void>
  isProcessingAI: boolean
}

export function EditorSidebar({
  orcamento,
  resultado,
  baseReferencia,
  catalogoBases,
  onUpdateOrcamento,
  onUploadEditalPDF,
  onMigrarBase,
  isProcessingAI
}: EditorSidebarProps) {
  const editalInputRef = useRef<HTMLInputElement>(null)

  // Estados locais para Admin Bases
  const [adminDialogOpen, setAdminDialogOpen] = useState(false)
  const [uploadOrgao, setUploadOrgao] = useState<FonteBase>("SINAPI")
  const [uploadUf, setUploadUf] = useState("GO")
  const [uploadMesAno, setUploadMesAno] = useState("2026-05")
  const [uploadRegime, setUploadRegime] = useState<RegimePreco>("nao_desonerado")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploadingBase, setIsUploadingBase] = useState(false)
  const [adminStatusText, setAdminStatusText] = useState("")

  const [arquivoInsumos, setArquivoInsumos] = useState<File | null>(null)
  const [arquivoComposicoes, setArquivoComposicoes] = useState<File | null>(null)

  // Desconto Linear
  const [descontoLinearPct, setDescontoLinearPct] = useState(5)
  const [classeLinear, setClasseLinear] = useState<"A" | "B" | "C">("A")

  // Nova observação / exigência
  const [novaObservacao, setNovaObservacao] = useState("")
  const [novaExigencia, setNovaExigencia] = useState("")

  const modeloBase: ModeloBaseConfig = orcamento.modelo_base || {
    ...MODELO_BASE_PADRAO,
    observacoes: [...MODELO_BASE_PADRAO.observacoes]
  }

  // Manipulação do BDI
  const handleBDIChange = (field: keyof typeof orcamento.bdi, val: number) => {
    onUpdateOrcamento({
      ...orcamento,
      bdi: {
        ...orcamento.bdi,
        [field]: val
      },
      atualizado_em: new Date().toISOString()
    })
  }

  // Manipulação de Edital
  const handleEditalChange = (field: keyof typeof orcamento.edital, val: any) => {
    onUpdateOrcamento({
      ...orcamento,
      edital: {
        ...orcamento.edital,
        [field]: val
      },
      atualizado_em: new Date().toISOString()
    })
  }

  // Manipulação do Modelo Base
  const handleModeloBaseChange = (field: keyof ModeloBaseConfig, val: any) => {
    onUpdateOrcamento({
      ...orcamento,
      modelo_base: {
        ...modeloBase,
        [field]: val
      },
      atualizado_em: new Date().toISOString()
    })
  }

  const handleAdicionarObservacao = () => {
    if (!novaObservacao.trim()) return
    handleModeloBaseChange("observacoes", [...(modeloBase.observacoes || []), novaObservacao.trim()])
    setNovaObservacao("")
    toast.success("Observação adicionada ao modelo base.")
  }

  const handleRemoverObservacao = (idx: number) => {
    handleModeloBaseChange(
      "observacoes",
      (modeloBase.observacoes || []).filter((_, i) => i !== idx)
    )
  }

  const handleAdicionarExigencia = () => {
    if (!novaExigencia.trim()) return
    onUpdateOrcamento({
      ...orcamento,
      exigencias_tecnicas: [...orcamento.exigencias_tecnicas, novaExigencia.trim()],
      atualizado_em: new Date().toISOString()
    })
    setNovaExigencia("")
  }

  const handleRemoverExigencia = (idx: number) => {
    onUpdateOrcamento({
      ...orcamento,
      exigencias_tecnicas: orcamento.exigencias_tecnicas.filter((_, i) => i !== idx),
      atualizado_em: new Date().toISOString()
    })
  }

  // Upload do Edital PDF
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUploadEditalPDF(file)
    }
    if (editalInputRef.current) editalInputRef.current.value = ""
  }

  // Aplicação do Desconto Linear na Curva ABC
  const handleAplicarDescontoLinear = () => {
    const atualizado = aplicarDescontoLinear(
      orcamento,
      resultado.curva_abc,
      descontoLinearPct,
      [classeLinear],
      `Desconto Linear de ${descontoLinearPct}% na Classe ${classeLinear}`
    )
    onUpdateOrcamento(atualizado)
    toast.success(`Deságio de ${descontoLinearPct}% aplicado aos insumos Classe ${classeLinear}!`)
  }

  // Reset de deságios
  const handleLimparDesagios = () => {
    onUpdateOrcamento({
      ...orcamento,
      insumos_modificados: {},
      atualizado_em: new Date().toISOString()
    })
    toast.info("Todos os deságios foram removidos.")
  }

  // Execução de Importação de Base no Firestore
  const handleExecutarImportacaoBase = async () => {
    if (!arquivoInsumos && !arquivoComposicoes) {
      toast.error("Selecione ao menos um arquivo de insumos ou composições.")
      return
    }

    try {
      setIsUploadingBase(true)
      setUploadProgress(5)
      setAdminStatusText("Lendo arquivos...")

      let parsedInsumos
      let parsedComposicoes

      if (arquivoInsumos) {
        setAdminStatusText("Processando planilha de insumos...")
        const res = await parsePlanilhaInsumos(arquivoInsumos)
        parsedInsumos = res.registros
      }

      if (arquivoComposicoes) {
        setAdminStatusText("Processando planilha de composições...")
        const res = await parsePlanilhaComposicoes(arquivoComposicoes)
        parsedComposicoes = res.registros
      }

      setAdminStatusText("Gravando no Firestore em lotes de 450 documentos...")
      await importarBaseEmLote({
        orgao: uploadOrgao,
        uf: uploadUf,
        mesAno: uploadMesAno,
        regime: uploadRegime,
        insumos: parsedInsumos,
        composicoes: parsedComposicoes,
        onProgress: (pct, grav, tot) => {
          setUploadProgress(pct)
          setAdminStatusText(`Gravando ${grav} de ${tot} documentos (${pct}%)...`)
        }
      })

      toast.success("Base oficial importada com sucesso no Firestore!")
      setAdminDialogOpen(false)
      setArquivoInsumos(null)
      setArquivoComposicoes(null)
      setUploadProgress(0)
    } catch (err: any) {
      console.error(err)
      toast.error(`Falha ao importar base: ${err.message}`)
    } finally {
      setIsUploadingBase(false)
    }
  }

  return (
    <aside className="w-full lg:w-96 flex-shrink-0 h-full flex flex-col bg-slate-900 border-r border-slate-800 text-slate-100 print:hidden shadow-xl">
      {/* Botão de Destaque: Upload de Edital por IA */}
      <div className="p-3 bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800">
        <input
          ref={editalInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          onClick={() => editalInputRef.current?.click()}
          disabled={isProcessingAI}
          className="w-full h-10 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          {isProcessingAI ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analisando PDF de Licitação...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-emerald-200 animate-pulse" />
              <span>Importar / Atualizar via PDF de Licitação</span>
            </>
          )}
        </Button>
      </div>

      {/* Navegação por Abas */}
      <Tabs defaultValue="edital" className="flex-1 flex flex-col min-h-0">
        <div className="px-2.5 pt-2 bg-slate-900 border-b border-slate-800">
          <TabsList className="w-full grid grid-cols-5 bg-slate-950 h-9 p-0.5 rounded-lg border border-slate-800">
            <TabsTrigger value="edital" className="text-[10px] px-1 data-[state=active]:bg-slate-800 text-slate-300">
              Edital
            </TabsTrigger>
            <TabsTrigger value="modelo" className="text-[10px] px-1 data-[state=active]:bg-slate-800 text-slate-300">
              Modelo Base
            </TabsTrigger>
            <TabsTrigger value="bdi" className="text-[10px] px-1 data-[state=active]:bg-slate-800 text-slate-300">
              BDI TCU
            </TabsTrigger>
            <TabsTrigger value="desagio" className="text-[10px] px-1 data-[state=active]:bg-slate-800 text-slate-300">
              Deságio
            </TabsTrigger>
            <TabsTrigger value="bases" className="text-[10px] px-1 data-[state=active]:bg-slate-800 text-slate-300">
              Bases
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 min-h-0 p-3">
          {/* ABA 1: DADOS DO EDITAL / CLIENTE */}
          <TabsContent value="edital" className="mt-0 space-y-3">
            <div className="space-y-2 bg-slate-800/40 p-3 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between pb-1 border-b border-slate-700/60">
                <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={13} /> Dados da Licitação / Cliente
                </Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="desonera-switch" className="text-[10px] text-slate-300">
                    Desonerado
                  </Label>
                  <Switch
                    id="desonera-switch"
                    checked={orcamento.desonerado}
                    onCheckedChange={(checked) =>
                      onUpdateOrcamento({
                        ...orcamento,
                        desonerado: checked,
                        atualizado_em: new Date().toISOString()
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Título Interno do Documento</Label>
                <Input
                  value={orcamento.titulo || ""}
                  onChange={(e) =>
                    onUpdateOrcamento({
                      ...orcamento,
                      titulo: e.target.value,
                      atualizado_em: new Date().toISOString()
                    })
                  }
                  placeholder="Ex: Proposta Drenagem / Concorrência 012/2026"
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Órgão Licitante / Cliente</Label>
                <Input
                  value={orcamento.edital.orgao}
                  onChange={(e) => {
                    onUpdateOrcamento({
                      ...orcamento,
                      edital: {
                        ...orcamento.edital,
                        orgao: e.target.value,
                        cliente: e.target.value
                      },
                      atualizado_em: new Date().toISOString()
                    })
                  }}
                  placeholder="Ex: Prefeitura Municipal de Anápolis / Construtora"
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Edital / Proposta nº</Label>
                  <Input
                    value={orcamento.edital.numero_edital}
                    onChange={(e) => handleEditalChange("numero_edital", e.target.value)}
                    placeholder="Ex: 012/2026"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Município/UF</Label>
                  <Input
                    value={orcamento.edital.municipio_uf}
                    onChange={(e) => handleEditalChange("municipio_uf", e.target.value)}
                    placeholder="Anápolis/GO"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Objeto da Obra / Escopo</Label>
                <Textarea
                  value={orcamento.edital.objeto}
                  onChange={(e) => handleEditalChange("objeto", e.target.value)}
                  placeholder="Descrição completa do objeto da licitação ou serviço..."
                  className="text-xs min-h-[60px] bg-slate-950 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Data</Label>
                  <Input
                    type="date"
                    value={orcamento.edital.data_proposta}
                    onChange={(e) => handleEditalChange("data_proposta", e.target.value)}
                    className="h-7 text-xs bg-slate-950 border-slate-700 px-1.5"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Prazo (Meses)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={orcamento.cronograma.prazo_meses}
                    onChange={(e) => {
                      const meses = Math.max(1, parseInt(e.target.value) || 1)
                      onUpdateOrcamento({
                        ...orcamento,
                        cronograma: redimensionarCronograma(
                          orcamento.cronograma,
                          orcamento.itens_planilha.map((et) => et.id),
                          meses
                        ),
                        atualizado_em: new Date().toISOString()
                      })
                    }}
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Validade (Dias)</Label>
                  <Input
                    type="number"
                    value={orcamento.edital.validade_dias}
                    onChange={(e) => handleEditalChange("validade_dias", parseInt(e.target.value) || 60)}
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Tabela de Referência Ativa</Label>
                <select
                  value={orcamento.ref_base_id || ""}
                  onChange={(e) => onMigrarBase(e.target.value)}
                  className="w-full h-7 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
                >
                  <option value="">Selecione a Base...</option>
                  {catalogoBases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.descricao || b.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Exigências Técnicas Extraídas / Editáveis */}
            <div className="p-3 bg-amber-950/25 border border-amber-900/50 rounded-lg space-y-2">
              <Label className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertCircle size={13} /> Exigências Técnicas do Edital
              </Label>
              {orcamento.exigencias_tecnicas.length > 0 ? (
                <ul className="text-[10px] text-amber-200/90 space-y-1.5">
                  {orcamento.exigencias_tecnicas.map((ex, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 bg-slate-950/50 p-1.5 rounded">
                      <span>• {ex}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoverExigencia(i)}
                        className="text-slate-500 hover:text-red-400 shrink-0"
                        title="Remover exigência"
                      >
                        <Trash2 size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-slate-400">Nenhuma exigência técnica registrada.</p>
              )}
              <div className="flex gap-1.5 pt-1">
                <Input
                  value={novaExigencia}
                  onChange={(e) => setNovaExigencia(e.target.value)}
                  placeholder="Adicionar exigência técnica..."
                  className="h-7 text-[11px] bg-slate-950 border-slate-700"
                />
                <Button
                  size="sm"
                  onClick={handleAdicionarExigencia}
                  className="h-7 px-2 bg-amber-600 hover:bg-amber-500 text-white"
                >
                  <Plus size={12} />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ABA 2: MODELO BASE (DADOS PROPONENTE & TEXTOS DA PROPOSTA A4) */}
          <TabsContent value="modelo" className="mt-0 space-y-3">
            {/* Dados da Empresa Proponente */}
            <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 space-y-2">
              <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-700/60">
                <Building2 size={13} /> Empresa Proponente & Responsável
              </Label>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Razão Social da Licitante</Label>
                <Input
                  value={orcamento.edital.empresa_licitante}
                  onChange={(e) => handleEditalChange("empresa_licitante", e.target.value)}
                  placeholder="CONSTRUTORA E ENGENHARIA MODELO LTDA"
                  className="h-7 text-xs bg-slate-950 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">CNPJ</Label>
                  <Input
                    value={orcamento.edital.cnpj_licitante}
                    onChange={(e) => handleEditalChange("cnpj_licitante", e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Telefone Contato</Label>
                  <Input
                    value={modeloBase.telefone_contato}
                    onChange={(e) => handleModeloBaseChange("telefone_contato", e.target.value)}
                    placeholder="(62) 3000-0000"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Responsável Técnico</Label>
                  <Input
                    value={orcamento.edital.responsavel_tecnico}
                    onChange={(e) => handleEditalChange("responsavel_tecnico", e.target.value)}
                    placeholder="Eng. Civil Responsável"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Registro CREA / CAU</Label>
                  <Input
                    value={orcamento.edital.registro_profissional}
                    onChange={(e) => handleEditalChange("registro_profissional", e.target.value)}
                    placeholder="CREA-GO"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Aos Cuidados (A/C)</Label>
                  <Input
                    value={modeloBase.aos_cuidados}
                    onChange={(e) => handleModeloBaseChange("aos_cuidados", e.target.value)}
                    placeholder="Comissão Permanente de Licitação"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Local / Endereço da Obra</Label>
                  <Input
                    value={modeloBase.endereco_obra}
                    onChange={(e) => handleModeloBaseChange("endereco_obra", e.target.value)}
                    placeholder="Endereço da obra"
                    className="h-7 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
              </div>
            </div>

            {/* Textos e Seções do Modelo Base */}
            <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 space-y-2.5">
              <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-700/60">
                <LayoutTemplate size={13} /> Textos do Modelo Base A4
              </Label>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Apresentação / Introdução da Proposta</Label>
                <Textarea
                  value={modeloBase.introducao_texto}
                  onChange={(e) => handleModeloBaseChange("introducao_texto", e.target.value)}
                  className="text-xs min-h-[64px] bg-slate-950 border-slate-700"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Metodologia Técnica</Label>
                <Textarea
                  value={modeloBase.metodologia_tecnica}
                  onChange={(e) => handleModeloBaseChange("metodologia_tecnica", e.target.value)}
                  className="text-xs min-h-[64px] bg-slate-950 border-slate-700"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Condições de Pagamento</Label>
                <Textarea
                  value={modeloBase.condicoes_pagamento}
                  onChange={(e) => handleModeloBaseChange("condicoes_pagamento", e.target.value)}
                  className="text-xs min-h-[48px] bg-slate-950 border-slate-700"
                />
              </div>

              {/* Observações Gerais do Modelo Base */}
              <div className="space-y-1.5 pt-1 border-t border-slate-700/60">
                <Label className="text-[10px] text-slate-300 font-semibold">
                  Observações da Proposta ({(modeloBase.observacoes || []).length})
                </Label>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {(modeloBase.observacoes || []).map((obs, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-2 text-[10px] bg-slate-950 p-1.5 rounded border border-slate-800"
                    >
                      <span className="text-slate-300">
                        {idx + 1}. {obs}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoverObservacao(idx)}
                        className="text-slate-500 hover:text-red-400 shrink-0"
                        title="Remover observação"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    value={novaObservacao}
                    onChange={(e) => setNovaObservacao(e.target.value)}
                    placeholder="Nova cláusula / observação..."
                    className="h-7 text-[11px] bg-slate-950 border-slate-700"
                  />
                  <Button
                    size="sm"
                    onClick={handleAdicionarObservacao}
                    className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Plus size={12} />
                  </Button>
                </div>
              </div>

              {/* Opções de Exibição no Papel A4 */}
              <div className="space-y-2 pt-2 border-t border-slate-700/60 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Quadro Analítico de BDI (TCU)</span>
                  <Switch
                    checked={modeloBase.exibir_bdi_proposta}
                    onCheckedChange={(v) => handleModeloBaseChange("exibir_bdi_proposta", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Resumo do Cronograma na Proposta</span>
                  <Switch
                    checked={modeloBase.exibir_cronograma_proposta}
                    onCheckedChange={(v) => handleModeloBaseChange("exibir_cronograma_proposta", v)}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ABA 3: BDI (TCU) */}
          <TabsContent value="bdi" className="mt-0 space-y-3">
            <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-700">
                <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Percent size={13} /> Parâmetros Acórdão 2.622/2013 TCU
                </Label>
                <Badge className="bg-emerald-500/20 text-emerald-300 font-mono text-xs">
                  {fmtPct(resultado.bdi.bdi_percentual)}
                </Badge>
              </div>

              {/* Sliders e Inputs */}
              {[
                { key: "ac", label: "Administração Central (AC)", max: 10 },
                { key: "s", label: "Seguros (S)", max: 3 },
                { key: "r", label: "Riscos (R)", max: 3 },
                { key: "g", label: "Garantias (G)", max: 3 },
                { key: "df", label: "Despesas Financeiras (DF)", max: 4 },
                { key: "lucro", label: "Lucro Bruto (L)", max: 15 },
                { key: "pis", label: "PIS", max: 3 },
                { key: "cofins", label: "COFINS", max: 5 },
                { key: "iss", label: "ISS", max: 5 }
              ].map(({ key, label, max }) => {
                const val = (orcamento.bdi as any)[key] ?? 0
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-300">{label}</span>
                      <span className="font-mono text-emerald-400 font-semibold">{val.toFixed(2)}%</span>
                    </div>
                    <Slider
                      value={[val]}
                      min={0}
                      max={max}
                      step={0.01}
                      onValueChange={([v]) => handleBDIChange(key as any, v)}
                      className="py-1"
                    />
                  </div>
                )
              })}

              {/* CPRB Automática quando Desonerado */}
              <div className="pt-2 border-t border-slate-700 flex justify-between items-center text-[10px]">
                <span className="text-slate-300">CPRB Automática (Desoneração):</span>
                <span className="font-mono text-amber-400 font-bold">
                  {orcamento.desonerado ? "4,50%" : "0,00%"}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* ABA 4: ENGENHARIA DE DESÁGIO */}
          <TabsContent value="desagio" className="mt-0 space-y-3">
            <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-700">
                <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <TrendingDown size={13} /> Desconto Linear em Lote
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleLimparDesagios}
                  className="h-6 text-[10px] text-slate-400 hover:text-red-400"
                >
                  Limpar Todos
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Classe Curva ABC</Label>
                  <select
                    value={classeLinear}
                    onChange={(e) => setClasseLinear(e.target.value as any)}
                    className="w-full h-7 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
                  >
                    <option value="A">Classe A (80% do valor)</option>
                    <option value="B">Classe B (15% do valor)</option>
                    <option value="C">Classe C (5% do valor)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Desconto Linear (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={descontoLinearPct}
                    onChange={(e) => setDescontoLinearPct(parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs bg-slate-950 border-slate-700 text-right font-mono"
                  />
                </div>
              </div>

              <Button
                onClick={handleAplicarDescontoLinear}
                className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium shadow"
              >
                Aplicar Deságio em Lote
              </Button>
            </div>

            {/* Listagem Resumida de Insumos da Curva ABC */}
            <div className="space-y-2">
              <Label className="text-[10px] text-slate-400 uppercase tracking-wider">
                Insumos Mais Relevantes (Curva ABC)
              </Label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {resultado.curva_abc.length === 0 ? (
                  <p className="text-[10px] text-slate-500 py-3 text-center">
                    Adicione serviços com composições da base (ex: SINAPI) para visualizar a Curva ABC de insumos.
                  </p>
                ) : (
                  resultado.curva_abc.slice(0, 15).map((ins) => {
                    const mod = orcamento.insumos_modificados[ins.id]
                    return (
                      <div
                        key={ins.id}
                        className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[8px] h-3.5 px-1 ${
                                ins.classe === "A"
                                  ? "text-amber-400 border-amber-600"
                                  : ins.classe === "B"
                                  ? "text-blue-400 border-blue-600"
                                  : "text-slate-400 border-slate-600"
                              }`}
                            >
                              Classe {ins.classe}
                            </Badge>
                            <span className="font-semibold text-slate-200">{ins.codigo}</span>
                            <span className="text-slate-400 truncate max-w-[140px]">{ins.descricao}</span>
                          </div>
                          <div className="text-slate-500 text-[9px] mt-0.5">
                            Base: {fmtBRL(ins.preco_base)} | Atual: {fmtBRL(ins.preco_atual)}
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-1">
                          <Input
                            type="number"
                            placeholder="%"
                            value={mod?.desconto_percentual || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0
                              const novoMod: InsumoModificado | null =
                                val > 0 ? { modo: "percentual", desconto_percentual: val, novo_preco: 0 } : null
                              onUpdateOrcamento(definirDesagioInsumo(orcamento, ins.id, novoMod))
                            }}
                            className="h-6 w-14 text-right bg-slate-900 border-slate-700 text-[10px] px-1 font-mono text-amber-400"
                          />
                          <span className="text-slate-400">%</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </TabsContent>

          {/* ABA 5: ADMIN BASES OFICIAIS */}
          <TabsContent value="bases" className="mt-0 space-y-3">
            <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-700">
                <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Database size={13} /> Gestão de Bases Oficiais
                </Label>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">
                Importe planilhas mensais oficiais da SINAPI (Caixa) ou GOINFRA em CSV ou XLSX para o Firestore
                em lotes automáticos.
              </p>

              <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full h-8 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5">
                    <Upload size={13} /> Importar Nova Planilha Mensal
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-sm font-bold text-slate-100">
                      Upload de Base SINAPI / GOINFRA
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-400">
                      Gravação no Firestore com processamento em blocos de 450 documentos.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 py-2 text-xs">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px]">Órgão</Label>
                        <select
                          value={uploadOrgao}
                          onChange={(e) => setUploadOrgao(e.target.value as any)}
                          className="w-full h-7 rounded border border-slate-700 bg-slate-950 px-2 text-xs"
                        >
                          <option value="SINAPI">SINAPI</option>
                          <option value="GOINFRA">GOINFRA</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px]">UF</Label>
                        <Input
                          value={uploadUf}
                          onChange={(e) => setUploadUf(e.target.value.toUpperCase())}
                          className="h-7 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Mês/Ano</Label>
                        <Input
                          value={uploadMesAno}
                          onChange={(e) => setUploadMesAno(e.target.value)}
                          placeholder="2026-05"
                          className="h-7 text-xs bg-slate-950 border-slate-700"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px]">Regime de Preço do Arquivo</Label>
                      <select
                        value={uploadRegime}
                        onChange={(e) => setUploadRegime(e.target.value as any)}
                        className="w-full h-7 rounded border border-slate-700 bg-slate-950 px-2 text-xs"
                      >
                        <option value="nao_desonerado">Não Desonerado</option>
                        <option value="desonerado">Desonerado</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px]">Arquivo de Insumos (CSV / XLSX)</Label>
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls,.txt"
                        onChange={(e) => setArquivoInsumos(e.target.files?.[0] || null)}
                        className="h-8 text-xs bg-slate-950 border-slate-700 file:bg-slate-800 file:text-slate-300 file:border-0 file:rounded file:text-[10px]"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px]">Arquivo de Composições Analíticas (CSV / XLSX)</Label>
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls,.txt"
                        onChange={(e) => setArquivoComposicoes(e.target.files?.[0] || null)}
                        className="h-8 text-xs bg-slate-950 border-slate-700 file:bg-slate-800 file:text-slate-300 file:border-0 file:rounded file:text-[10px]"
                      />
                    </div>

                    {isUploadingBase && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{adminStatusText}</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2 bg-slate-800" />
                      </div>
                    )}

                    <Button
                      onClick={handleExecutarImportacaoBase}
                      disabled={isUploadingBase}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs mt-2"
                    >
                      {isUploadingBase ? "Gravando no Firestore..." : "Iniciar Importação em Lote"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Bases Disponíveis */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-slate-400 uppercase tracking-wider">
                Catálogo Disponível ({catalogoBases.length})
              </Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {catalogoBases.map((b) => (
                  <div
                    key={b.id}
                    className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-200">{b.id}</span>
                      <div className="text-[9px] text-slate-400">{b.descricao}</div>
                    </div>
                    <Badge variant="outline" className="text-[9px] h-4">
                      {b.orgao}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  )
}