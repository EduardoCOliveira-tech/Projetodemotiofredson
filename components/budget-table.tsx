"use client"

import React, { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Sparkles,
  Plus,
  Trash2,
  Search,
  Pencil,
  Copy,
  FolderPlus,
  Database,
  FilePlus2,
  Check
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type {
  BaseReferencia,
  EtapaPlanilha,
  FonteItem,
  OrcamentoLicita,
  ServicoPlanilha
} from "@/lib/proposal-types"
import type {
  ResultadoOrcamento
} from "@/lib/budget-engine"
import { fmtBRL, fmtNum, fmtPct, redimensionarCronograma } from "@/lib/budget-engine"
import { BASE_DEMO } from "@/lib/demo-data"
import { toast } from "sonner"

interface BudgetTableProps {
  orcamento: OrcamentoLicita
  resultado: ResultadoOrcamento
  baseReferencia?: BaseReferencia
  onUpdateOrcamento: (orc: OrcamentoLicita) => void
  onOpenDesagioModal?: (insumoId: string) => void
}

const gerarId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function BudgetTable({
  orcamento,
  resultado,
  baseReferencia = BASE_DEMO,
  onUpdateOrcamento
}: BudgetTableProps) {
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState("")

  // Modal de Nova Etapa / Editar Etapa
  const [etapaDialogOpen, setEtapaDialogOpen] = useState(false)
  const [editingEtapaId, setEditingEtapaId] = useState<string | null>(null)
  const [etapaItemInput, setEtapaItemInput] = useState("")
  const [etapaDescInput, setEtapaDescInput] = useState("")

  // Modal de Adicionar / Editar Serviço
  const [servicoDialogOpen, setServicoDialogOpen] = useState(false)
  const [targetEtapaId, setTargetEtapaId] = useState<string>("")
  const [editingServicoId, setEditingServicoId] = useState<string | null>(null)
  const [addTab, setAddTab] = useState<"base_oficial" | "manual">("base_oficial")
  const [baseSearch, setBaseSearch] = useState("")

  // Campos do formulário de serviço (criação manual ou edição)
  const [srvItem, setSrvItem] = useState("1.1")
  const [srvCodigo, setSrvCodigo] = useState("PR-001")
  const [srvFonte, setSrvFonte] = useState<FonteItem>("PROPRIA")
  const [srvDescricao, setSrvDescricao] = useState("")
  const [srvUnidade, setSrvUnidade] = useState("UN")
  const [srvQuantidade, setSrvQuantidade] = useState("1")
  const [srvCustoManual, setSrvCustoManual] = useState("0")
  const [srvTetoEdital, setSrvTetoEdital] = useState("")

  const toggleExpand = (servicoId: string) => {
    setExpandedServices((prev) => ({
      ...prev,
      [servicoId]: !prev[servicoId]
    }))
  }

  /* ============================================================================
   * AÇÕES DE ETAPA (CRIAR / EDITAR / EXCLUIR)
   * ========================================================================== */

  const abrirModalNovaEtapa = () => {
    const proxNum = String(orcamento.itens_planilha.length + 1)
    setEditingEtapaId(null)
    setEtapaItemInput(proxNum)
    setEtapaDescInput("")
    setEtapaDialogOpen(true)
  }

  const abrirModalEditarEtapa = (etapa: EtapaPlanilha) => {
    setEditingEtapaId(etapa.id)
    setEtapaItemInput(etapa.item)
    setEtapaDescInput(etapa.descricao)
    setEtapaDialogOpen(true)
  }

  const handleSalvarEtapa = () => {
    const descLimpa = etapaDescInput.trim().toUpperCase() || "NOVA ETAPA DE SERVIÇOS"
    const itemLimpo = etapaItemInput.trim() || String(orcamento.itens_planilha.length + 1)

    if (editingEtapaId) {
      const novasEtapas = orcamento.itens_planilha.map((et) =>
        et.id === editingEtapaId ? { ...et, item: itemLimpo, descricao: descLimpa } : et
      )
      onUpdateOrcamento({
        ...orcamento,
        itens_planilha: novasEtapas,
        atualizado_em: new Date().toISOString()
      })
      toast.success("Etapa atualizada com sucesso!")
    } else {
      const novaEtapa: EtapaPlanilha = {
        id: `et-${gerarId()}`,
        item: itemLimpo,
        descricao: descLimpa,
        servicos: []
      }
      const novasEtapas = [...orcamento.itens_planilha, novaEtapa]
      const novoCronograma = redimensionarCronograma(
        orcamento.cronograma,
        novasEtapas.map((e) => e.id),
        orcamento.cronograma.prazo_meses
      )
      onUpdateOrcamento({
        ...orcamento,
        itens_planilha: novasEtapas,
        cronograma: novoCronograma,
        atualizado_em: new Date().toISOString()
      })
      toast.success(`Etapa "${descLimpa}" adicionada à planilha!`)
    }
    setEtapaDialogOpen(false)
  }

  const handleExcluirEtapa = (etapaId: string, descricao: string) => {
    const novasEtapas = orcamento.itens_planilha
      .filter((e) => e.id !== etapaId)
      .map((et, idx) => ({ ...et, item: String(idx + 1) }))

    const novoCronograma = redimensionarCronograma(
      orcamento.cronograma,
      novasEtapas.map((e) => e.id),
      orcamento.cronograma.prazo_meses
    )
    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      cronograma: novoCronograma,
      atualizado_em: new Date().toISOString()
    })
    toast.info(`Etapa "${descricao}" removida.`)
  }

  /* ============================================================================
   * AÇÕES DE SERVIÇO / ITEM (ADICIONAR / EDITAR / DUPLICAR / EXCLUIR)
   * ========================================================================== */

  const calcularProximoItemHierarquia = (etapaId: string): string => {
    const etapa = orcamento.itens_planilha.find((e) => e.id === etapaId)
    if (!etapa) return "1.1"
    return `${etapa.item}.${etapa.servicos.length + 1}`
  }

  const garantirEtapaAlvo = (etapaIdPreferencial?: string): { etapaId: string; etapasAtuais: EtapaPlanilha[] } => {
    if (etapaIdPreferencial && orcamento.itens_planilha.some((e) => e.id === etapaIdPreferencial)) {
      return { etapaId: etapaIdPreferencial, etapasAtuais: orcamento.itens_planilha }
    }
    if (orcamento.itens_planilha.length > 0) {
      return { etapaId: orcamento.itens_planilha[0].id, etapasAtuais: orcamento.itens_planilha }
    }
    const primeiraEtapa: EtapaPlanilha = {
      id: `et-${gerarId()}`,
      item: "1",
      descricao: "SERVIÇOS PRELIMINARES",
      servicos: []
    }
    return { etapaId: primeiraEtapa.id, etapasAtuais: [primeiraEtapa] }
  }

  const abrirModalAdicionarServico = (
    etapaId?: string,
    abaInicial: "base_oficial" | "manual" = "base_oficial"
  ) => {
    const { etapaId: alvoId } = garantirEtapaAlvo(etapaId)
    setTargetEtapaId(alvoId)
    setEditingServicoId(null)
    setAddTab(abaInicial)
    setSrvItem(calcularProximoItemHierarquia(alvoId))
    setSrvCodigo(`PR-${String(Math.floor(Math.random() * 900) + 100)}`)
    setSrvFonte("PROPRIA")
    setSrvDescricao("")
    setSrvUnidade("UN")
    setSrvQuantidade("1")
    setSrvCustoManual("0")
    setSrvTetoEdital("")
    setServicoDialogOpen(true)
  }

  const abrirModalEditarServico = (etapaId: string, s: ServicoPlanilha) => {
    setTargetEtapaId(etapaId)
    setEditingServicoId(s.id)
    setAddTab("manual")
    setSrvItem(s.item)
    setSrvCodigo(s.codigo)
    setSrvFonte(s.fonte)
    setSrvDescricao(s.descricao)
    setSrvUnidade(s.unidade)
    setSrvQuantidade(String(s.quantidade))
    setSrvCustoManual(String(s.custo_unitario_manual ?? 0))
    setSrvTetoEdital(s.preco_unitario_edital != null ? String(s.preco_unitario_edital) : "")
    setServicoDialogOpen(true)
  }

  const inserirServicoNaEtapa = (etapaId: string, novoServico: Omit<ServicoPlanilha, "id" | "item"> & { item?: string }) => {
    const { etapaId: alvoId, etapasAtuais } = garantirEtapaAlvo(etapaId)
    const novasEtapas = etapasAtuais.map((et) => {
      if (et.id !== alvoId) return et
      const itemHierarquia = novoServico.item || `${et.item}.${et.servicos.length + 1}`
      const criado: ServicoPlanilha = {
        id: `srv-${gerarId()}`,
        item: itemHierarquia,
        codigo: novoServico.codigo,
        fonte: novoServico.fonte,
        descricao: novoServico.descricao,
        unidade: novoServico.unidade,
        quantidade: novoServico.quantidade,
        preco_unitario_edital: novoServico.preco_unitario_edital,
        custo_unitario_manual: novoServico.custo_unitario_manual,
        orfao: novoServico.orfao
      }
      return {
        ...et,
        servicos: [...et.servicos, criado]
      }
    })

    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      atualizado_em: new Date().toISOString()
    })
  }

  const handleSalvarServicoManual = () => {
    if (!srvDescricao.trim()) {
      toast.error("Informe a descrição do serviço.")
      return
    }
    const qtd = parseFloat(srvQuantidade) || 1
    const custoManual = parseFloat(srvCustoManual) || 0
    const teto = srvTetoEdital.trim() !== "" ? parseFloat(srvTetoEdital) : null

    if (editingServicoId) {
      const novasEtapas = orcamento.itens_planilha.map((et) => {
        if (et.id !== targetEtapaId) return et
        return {
          ...et,
          servicos: et.servicos.map((s) =>
            s.id === editingServicoId
              ? {
                  ...s,
                  item: srvItem.trim() || s.item,
                  codigo: srvCodigo.trim() || "PR-001",
                  fonte: srvFonte,
                  descricao: srvDescricao.trim(),
                  unidade: srvUnidade.trim().toUpperCase() || "UN",
                  quantidade: qtd,
                  custo_unitario_manual: custoManual,
                  preco_unitario_edital: teto
                }
              : s
          )
        }
      })
      onUpdateOrcamento({
        ...orcamento,
        itens_planilha: novasEtapas,
        atualizado_em: new Date().toISOString()
      })
      toast.success("Serviço atualizado!")
    } else {
      inserirServicoNaEtapa(targetEtapaId, {
        item: srvItem.trim() || undefined,
        codigo: srvCodigo.trim() || "PR-001",
        fonte: srvFonte,
        descricao: srvDescricao.trim(),
        unidade: srvUnidade.trim().toUpperCase() || "UN",
        quantidade: qtd,
        custo_unitario_manual: custoManual,
        preco_unitario_edital: teto
      })
      toast.success("Serviço adicionado à planilha!")
    }
    setServicoDialogOpen(false)
  }

  const handleAdicionarDaBaseOficial = (entidade: {
    codigo: string
    fonte: "SINAPI" | "GOINFRA"
    descricao: string
    unidade: string
  }) => {
    inserirServicoNaEtapa(targetEtapaId, {
      codigo: entidade.codigo,
      fonte: entidade.fonte,
      descricao: entidade.descricao,
      unidade: entidade.unidade.toUpperCase(),
      quantidade: 1,
      preco_unitario_edital: null
    })
    toast.success(`${entidade.fonte} ${entidade.codigo} adicionado à planilha!`)
  }

  const handleDuplicarServico = (etapaId: string, s: ServicoPlanilha) => {
    const novasEtapas = orcamento.itens_planilha.map((et) => {
      if (et.id !== etapaId) return et
      const novoItem = `${et.item}.${et.servicos.length + 1}`
      const copia: ServicoPlanilha = {
        ...s,
        id: `srv-${gerarId()}`,
        item: novoItem,
        descricao: `${s.descricao}`
      }
      return {
        ...et,
        servicos: [...et.servicos, copia]
      }
    })
    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      atualizado_em: new Date().toISOString()
    })
    toast.success("Serviço duplicado!")
  }

  const handleExcluirServico = (etapaId: string, servicoId: string) => {
    const novasEtapas = orcamento.itens_planilha.map((et) => {
      if (et.id !== etapaId) return et
      const restantes = et.servicos
        .filter((s) => s.id !== servicoId)
        .map((s, idx) => ({ ...s, item: `${et.item}.${idx + 1}` }))
      return {
        ...et,
        servicos: restantes
      }
    })
    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      atualizado_em: new Date().toISOString()
    })
    toast.info("Serviço removido da etapa.")
  }

  const handleUpdateQuantidade = (etapaId: string, servicoId: string, qtdStr: string) => {
    const qtd = parseFloat(qtdStr) || 0
    const novasEtapas = orcamento.itens_planilha.map((et) => {
      if (et.id !== etapaId) return et
      return {
        ...et,
        servicos: et.servicos.map((s) => (s.id === servicoId ? { ...s, quantidade: qtd } : s))
      }
    })
    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      atualizado_em: new Date().toISOString()
    })
  }

  const handleUpdateCustoManual = (etapaId: string, servicoId: string, valStr: string) => {
    const val = parseFloat(valStr) || 0
    const novasEtapas = orcamento.itens_planilha.map((et) => {
      if (et.id !== etapaId) return et
      return {
        ...et,
        servicos: et.servicos.map((s) => (s.id === servicoId ? { ...s, custo_unitario_manual: val } : s))
      }
    })
    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      atualizado_em: new Date().toISOString()
    })
  }

  const handleUpdateTetoEdital = (etapaId: string, servicoId: string, valStr: string) => {
    const val = valStr.trim() === "" ? null : parseFloat(valStr) || 0
    const novasEtapas = orcamento.itens_planilha.map((et) => {
      if (et.id !== etapaId) return et
      return {
        ...et,
        servicos: et.servicos.map((s) => (s.id === servicoId ? { ...s, preco_unitario_edital: val } : s))
      }
    })
    onUpdateOrcamento({
      ...orcamento,
      itens_planilha: novasEtapas,
      atualizado_em: new Date().toISOString()
    })
  }

  const filteredEtapas = resultado.etapas
    .map((et) => {
      if (!searchTerm) return et
      const filtrados = et.servicos.filter(
        (s) =>
          s.servico.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.servico.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.servico.item.includes(searchTerm)
      )
      return { ...et, servicos: filtrados }
    })
    .filter((et) => !searchTerm || et.servicos.length > 0)

  // Lista da Base Oficial (Composições + Insumos) para o modal
  const listaBaseOficial = [
    ...Object.values(baseReferencia.composicoes || {}).map((c) => ({
      id: c.id,
      codigo: c.codigo,
      fonte: c.fonte,
      descricao: c.descricao,
      unidade: c.unidade,
      categoria: "Composição CPU"
    })),
    ...Object.values(baseReferencia.insumos || {}).map((i) => ({
      id: i.id,
      codigo: i.codigo,
      fonte: i.fonte,
      descricao: i.descricao,
      unidade: i.unidade,
      categoria: `Insumo (${i.tipo})`
    }))
  ].filter(
    (item) =>
      !baseSearch ||
      item.codigo.toLowerCase().includes(baseSearch.toLowerCase()) ||
      item.descricao.toLowerCase().includes(baseSearch.toLowerCase())
  )

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
      {/* Barra Superior de Busca e Ações de Adição */}
      <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, serviço ou etapa..."
            className="pl-9 h-9 bg-slate-900 border-slate-700 text-xs text-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={abrirModalNovaEtapa}
            className="h-9 text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
            Nova Etapa
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => abrirModalAdicionarServico(undefined, "base_oficial")}
            className="h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Serviço / Item
          </Button>
        </div>
      </div>

      {/* Tabela Principal */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
              <th className="py-3 px-3 w-16 text-center">Item</th>
              <th className="py-3 px-2 w-28">Código/Fonte</th>
              <th className="py-3 px-3">Descrição do Serviço / Composição</th>
              <th className="py-3 px-2 text-center w-14">Unid</th>
              <th className="py-3 px-2 text-right w-20">Qtd</th>
              <th className="py-3 px-2 text-right w-28">Custo Dir. (R$)</th>
              <th className="py-3 px-2 text-right w-28">P.U. c/ BDI (R$)</th>
              <th className="py-3 px-2 text-right w-28">Teto Edital (R$)</th>
              <th className="py-3 px-3 text-right w-32 font-bold text-slate-300">Total (R$)</th>
              <th className="py-3 px-2 text-center w-24">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {filteredEtapas.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                  <div className="max-w-md mx-auto space-y-3">
                    <p className="text-sm font-medium text-slate-300">
                      Nenhuma etapa ou serviço cadastrado na planilha.
                    </p>
                    <p className="text-xs text-slate-500">
                      Adicione uma etapa ou escolha serviços da Base Oficial (SINAPI / GOINFRA) ou crie itens próprios do zero.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={abrirModalNovaEtapa}
                        className="text-xs border-slate-700 bg-slate-950 text-slate-200"
                      >
                        <FolderPlus className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                        Criar Etapa
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => abrirModalAdicionarServico(undefined, "base_oficial")}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Adicionar Primeiro Serviço
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredEtapas.map((et) => (
                <React.Fragment key={et.etapa.id}>
                  {/* Linha da Etapa */}
                  <tr className="bg-slate-800/75 hover:bg-slate-800 transition-colors font-sans text-xs">
                    <td className="py-2.5 px-3 font-bold text-emerald-400 text-center">{et.etapa.item}</td>
                    <td colSpan={6} className="py-2.5 px-2 font-bold text-slate-100 uppercase tracking-wide">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span>{et.etapa.descricao}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => abrirModalAdicionarServico(et.etapa.id, "base_oficial")}
                          className="h-6 px-2 text-[10px] font-medium bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-800/60"
                        >
                          <Plus size={12} className="mr-1" /> Adicionar Serviço nesta Etapa
                        </Button>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-400 font-mono text-[11px]">
                      {fmtPct(et.percentual_global)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400 font-mono text-xs">
                      {fmtBRL(et.total)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => abrirModalEditarEtapa(et.etapa)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="Renomear / Editar Etapa"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluirEtapa(et.etapa.id, et.etapa.descricao)}
                          className="p-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition-colors"
                          title="Excluir Etapa"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Estado vazio dentro da Etapa */}
                  {et.servicos.length === 0 && (
                    <tr className="bg-slate-950/40 font-sans">
                      <td colSpan={10} className="py-5 px-4 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                          <span>Esta etapa ainda não possui itens. Adicionar a partir de:</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => abrirModalAdicionarServico(et.etapa.id, "base_oficial")}
                            className="h-7 text-[11px] bg-slate-900 border-slate-700 text-blue-300 hover:bg-slate-800"
                          >
                            <Database size={12} className="mr-1" /> Base Oficial SINAPI / GOINFRA
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => abrirModalAdicionarServico(et.etapa.id, "manual")}
                            className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                          >
                            <FilePlus2 size={12} className="mr-1" /> Item Próprio do Zero
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Linhas de Serviços da Etapa */}
                  {et.servicos.map((resS) => {
                    const s = resS.servico
                    const isExpanded = !!expandedServices[s.id]
                    const hasCPU = resS.tipo_ref === "composicao" && resS.cpu && resS.cpu.linhas.length > 0

                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          className={`hover:bg-slate-800/40 transition-colors ${
                            resS.orfao
                              ? "bg-red-950/20"
                              : resS.acima_teto
                              ? "bg-rose-950/20"
                              : resS.com_desagio
                              ? "bg-amber-950/15"
                              : ""
                          }`}
                        >
                          {/* Item */}
                          <td className="py-2 px-3 text-center text-slate-400">{s.item}</td>

                          {/* Código + Fonte */}
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5">
                              {hasCPU && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(s.id)}
                                  className="text-slate-400 hover:text-white transition-colors"
                                  title="Ver CPU Analítica"
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              )}
                              <span className="font-semibold text-slate-200">{s.codigo}</span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 h-4 ${
                                  s.fonte === "SINAPI"
                                    ? "border-blue-700/60 text-blue-400 bg-blue-950/30"
                                    : s.fonte === "GOINFRA"
                                    ? "border-emerald-700/60 text-emerald-400 bg-emerald-950/30"
                                    : "border-slate-700 text-slate-400 bg-slate-900"
                                }`}
                              >
                                {s.fonte}
                              </Badge>
                            </div>
                          </td>

                          {/* Descrição */}
                          <td className="py-2 px-3 font-sans text-slate-200 leading-snug">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="cursor-pointer hover:text-emerald-300 transition-colors"
                                onClick={() => abrirModalEditarServico(et.etapa.id, s)}
                                title="Clique para editar a descrição e detalhes deste item"
                              >
                                {s.descricao}
                              </span>
                              {resS.orfao && (
                                <Badge variant="destructive" className="text-[9px] py-0 h-4">
                                  ÓRFÃO
                                </Badge>
                              )}
                              {resS.acima_teto && (
                                <Badge variant="destructive" className="text-[9px] py-0 h-4 bg-rose-600">
                                  ACIMA DO TETO
                                </Badge>
                              )}
                              {resS.com_desagio && (
                                <Badge className="text-[9px] py-0 h-4 bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  DESÁGIO ATIVO
                                </Badge>
                              )}
                            </div>
                          </td>

                          {/* Unidade */}
                          <td className="py-2 px-2 text-center text-slate-400 uppercase">{s.unidade}</td>

                          {/* Quantidade */}
                          <td className="py-2 px-2 text-right">
                            <Input
                              type="number"
                              step="any"
                              value={s.quantidade}
                              onChange={(e) => handleUpdateQuantidade(et.etapa.id, s.id, e.target.value)}
                              className="h-6 w-16 text-right bg-slate-950/50 border-slate-700 text-xs px-1 text-slate-100 font-mono ml-auto"
                            />
                          </td>

                          {/* Custo Direto */}
                          <td className="py-2 px-2 text-right text-slate-300">
                            {resS.tipo_ref === "manual" ? (
                              <Input
                                type="number"
                                step="any"
                                value={s.custo_unitario_manual || 0}
                                onChange={(e) => handleUpdateCustoManual(et.etapa.id, s.id, e.target.value)}
                                className="h-6 w-24 text-right bg-slate-950/50 border-slate-700 text-xs px-1 text-slate-100 font-mono ml-auto"
                              />
                            ) : (
                              fmtNum(resS.custo_unitario)
                            )}
                          </td>

                          {/* Preço Unitário c/ BDI */}
                          <td
                            className={`py-2 px-2 text-right font-semibold ${
                              resS.acima_teto ? "text-rose-400" : "text-emerald-400"
                            }`}
                          >
                            {fmtNum(resS.preco_unitario)}
                          </td>

                          {/* Teto Edital */}
                          <td className="py-2 px-2 text-right text-slate-400">
                            <Input
                              type="number"
                              step="any"
                              placeholder="-"
                              value={s.preco_unitario_edital ?? ""}
                              onChange={(e) => handleUpdateTetoEdital(et.etapa.id, s.id, e.target.value)}
                              className="h-6 w-20 text-right bg-slate-950/30 border-slate-800 text-xs px-1 text-slate-300 font-mono ml-auto"
                            />
                          </td>

                          {/* Total */}
                          <td className="py-2 px-3 text-right font-bold text-slate-100">
                            {fmtBRL(resS.total)}
                          </td>

                          {/* Ações CRUD da Linha */}
                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => abrirModalEditarServico(et.etapa.id, s)}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
                                title="Editar Serviço"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicarServico(et.etapa.id, s)}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors"
                                title="Duplicar Serviço"
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExcluirServico(et.etapa.id, s.id)}
                                className="p-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition-colors"
                                title="Remover Serviço"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Composição de Custo Unitário (CPU) Expandida */}
                        {isExpanded && resS.cpu && (
                          <tr className="bg-slate-950/90">
                            <td colSpan={10} className="p-4 border-l-4 border-emerald-500">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-sans pb-1 border-b border-slate-800">
                                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                                    <Sparkles size={13} />
                                    CPU Analítica: {s.codigo} ({s.descricao})
                                  </span>
                                  <span className="text-slate-400 font-mono text-[11px]">
                                    Custo Direto Composição:{" "}
                                    <strong className="text-slate-200">{fmtBRL(resS.cpu.custo_direto)}</strong>
                                  </span>
                                </div>

                                <table className="w-full text-[10px] font-mono">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800/80">
                                      <th className="py-1 px-2 text-left w-20">Tipo</th>
                                      <th className="py-1 px-2 text-left w-24">Código</th>
                                      <th className="py-1 px-2 text-left">Insumo / Composição Auxiliar</th>
                                      <th className="py-1 px-2 text-center w-12">Un</th>
                                      <th className="py-1 px-2 text-right w-20">Coef.</th>
                                      <th className="py-1 px-2 text-right w-24">Preço Base</th>
                                      <th className="py-1 px-2 text-right w-24">Preço c/ Deságio</th>
                                      <th className="py-1 px-2 text-right w-24 font-bold">Custo Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/40">
                                    {resS.cpu.linhas.map((l, lIdx) => (
                                      <tr
                                        key={`${l.id}-${lIdx}`}
                                        className={
                                          l.modificado
                                            ? "bg-amber-950/30 text-amber-200"
                                            : l.orfao
                                            ? "bg-red-950/30 text-red-300"
                                            : "hover:bg-slate-900/60"
                                        }
                                      >
                                        <td className="py-1 px-2 text-slate-400">{l.tipo_insumo || l.tipo}</td>
                                        <td className="py-1 px-2 font-semibold text-slate-300">{l.codigo}</td>
                                        <td className="py-1 px-2 font-sans truncate max-w-xs">{l.descricao}</td>
                                        <td className="py-1 px-2 text-center text-slate-400">{l.unidade}</td>
                                        <td className="py-1 px-2 text-right">{fmtNum(l.coeficiente, 4)}</td>
                                        <td className="py-1 px-2 text-right text-slate-400">{fmtNum(l.preco_base)}</td>
                                        <td
                                          className={`py-1 px-2 text-right font-medium ${
                                            l.modificado ? "text-amber-400 font-bold" : "text-slate-300"
                                          }`}
                                        >
                                          {fmtNum(l.preco_unitario)}
                                        </td>
                                        <td className="py-1 px-2 text-right font-bold text-slate-100">
                                          {fmtBRL(l.custo_parcial)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-950 text-slate-200 font-bold border-t-2 border-slate-700 text-xs">
              <td colSpan={6} className="py-3 px-3 text-right uppercase tracking-wider text-slate-400 font-sans">
                Valor Global da Proposta:
              </td>
              <td className="py-3 px-2 text-right text-emerald-400 font-mono text-sm">
                BDI {fmtPct(resultado.bdi.bdi_percentual)}
              </td>
              <td className="py-3 px-2 text-right text-slate-400 font-mono">
                Teto: {fmtBRL(resultado.valor_teto_edital)}
              </td>
              <td className="py-3 px-3 text-right text-emerald-400 font-mono text-sm">
                {fmtBRL(resultado.valor_global)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* MODAL 1: CRIAR / EDITAR ETAPA */}
      <Dialog open={etapaDialogOpen} onOpenChange={setEtapaDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-slate-100">
              {editingEtapaId ? "Editar Etapa da Planilha" : "Nova Etapa da Planilha"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Organize os serviços por capítulos ou etapas de execução seguindo o modelo base.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-[11px] text-slate-300">Item Nº</Label>
                <Input
                  value={etapaItemInput}
                  onChange={(e) => setEtapaItemInput(e.target.value)}
                  placeholder="1"
                  className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                />
              </div>
              <div className="col-span-3">
                <Label className="text-[11px] text-slate-300">Título da Etapa</Label>
                <Input
                  value={etapaDescInput}
                  onChange={(e) => setEtapaDescInput(e.target.value)}
                  placeholder="Ex: FUNDAÇÕES E INFRAESTRUTURA"
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
              onClick={() => setEtapaDialogOpen(false)}
              className="text-xs text-slate-400"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvarEtapa}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Salvar Etapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: ADICIONAR OU EDITAR SERVIÇO */}
      <Dialog open={servicoDialogOpen} onOpenChange={setServicoDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100">
              {editingServicoId
                ? "Editar Serviço / Item da Planilha"
                : "Adicionar Serviço / Item à Planilha"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Escolha a etapa de destino e insira composições/insumos da base oficial (SINAPI / GOINFRA) ou cadastre um item próprio do zero.
            </DialogDescription>
          </DialogHeader>

          {/* Seletor da Etapa de Destino */}
          {orcamento.itens_planilha.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <Label className="text-xs text-slate-300 shrink-0">Etapa de destino:</Label>
              <select
                value={targetEtapaId}
                onChange={(e) => {
                  setTargetEtapaId(e.target.value)
                  if (!editingServicoId) {
                    setSrvItem(calcularProximoItemHierarquia(e.target.value))
                  }
                }}
                disabled={!!editingServicoId}
                className="flex-1 h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
              >
                {orcamento.itens_planilha.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.item} - {et.descricao}
                  </option>
                ))}
              </select>
            </div>
          )}

          {editingServicoId ? (
            /* MODO EDIÇÃO DE ITEM */
            <div className="space-y-3 py-2 text-xs overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-300">Item Hierárquico</Label>
                  <Input
                    value={srvItem}
                    onChange={(e) => setSrvItem(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Código</Label>
                  <Input
                    value={srvCodigo}
                    onChange={(e) => setSrvCodigo(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Fonte</Label>
                  <select
                    value={srvFonte}
                    onChange={(e) => setSrvFonte(e.target.value as FonteItem)}
                    className="w-full h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                  >
                    <option value="PROPRIA">PRÓPRIA / COTAÇÃO</option>
                    <option value="SINAPI">SINAPI</option>
                    <option value="GOINFRA">GOINFRA</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-[11px] text-slate-300">Descrição Completa do Serviço</Label>
                <Textarea
                  value={srvDescricao}
                  onChange={(e) => setSrvDescricao(e.target.value)}
                  className="text-xs min-h-[80px] bg-slate-950 border-slate-700"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-300">Unidade</Label>
                  <Input
                    value={srvUnidade}
                    onChange={(e) => setSrvUnidade(e.target.value.toUpperCase())}
                    className="h-8 text-xs bg-slate-950 border-slate-700 uppercase"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Quantidade</Label>
                  <Input
                    type="number"
                    step="any"
                    value={srvQuantidade}
                    onChange={(e) => setSrvQuantidade(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Custo Direto (R$)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={srvCustoManual}
                    onChange={(e) => setSrvCustoManual(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-300">Teto Edital (R$)</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="Opcional"
                    value={srvTetoEdital}
                    onChange={(e) => setSrvTetoEdital(e.target.value)}
                    className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setServicoDialogOpen(false)}
                  className="text-xs text-slate-400"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSalvarServicoManual}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Check className="w-3.5 h-3.5 mr-1" /> Salvar Alterações
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* MODO ADICIONAR NOVO SERVIÇO (2 ABAS DE LICITAÇÃO) */
            <Tabs
              value={addTab}
              onValueChange={(v) => setAddTab(v as any)}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="grid grid-cols-2 bg-slate-950 border border-slate-800 h-9">
                <TabsTrigger value="base_oficial" className="text-xs data-[state=active]:bg-slate-800">
                  <Database className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                  Base Oficial (SINAPI / GOINFRA)
                </TabsTrigger>
                <TabsTrigger value="manual" className="text-xs data-[state=active]:bg-slate-800">
                  <FilePlus2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  Criar Item do Zero / Próprio
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: BASE OFICIAL (SINAPI / GOINFRA) */}
              <TabsContent value="base_oficial" className="space-y-3 mt-3 flex-1 overflow-hidden flex flex-col">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                  <Input
                    value={baseSearch}
                    onChange={(e) => setBaseSearch(e.target.value)}
                    placeholder="Buscar código ou descrição na base ativa (ex: D9001, Concreto, Alvenaria)..."
                    className="pl-8 h-8 text-xs bg-slate-950 border-slate-700"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {listaBaseOficial.map((ent) => (
                    <div
                      key={ent.id}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-blue-700/60 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono border-blue-800 text-blue-400">
                            {ent.fonte} {ent.codigo}
                          </Badge>
                          <span className="text-[10px] text-slate-400">{ent.categoria}</span>
                          <span className="text-[10px] text-slate-500 font-mono">Unid: {ent.unidade}</span>
                        </div>
                        <p className="text-xs text-slate-200 mt-1">{ent.descricao}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAdicionarDaBaseOficial(ent)}
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white shrink-0"
                      >
                        <Plus size={12} className="mr-1" /> Inserir
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* ABA 2: CRIAR ITEM PERSONALIZADO DO ZERO */}
              <TabsContent value="manual" className="space-y-3 mt-3 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px] text-slate-300">Item Hierárquico</Label>
                    <Input
                      value={srvItem}
                      onChange={(e) => setSrvItem(e.target.value)}
                      placeholder="1.1"
                      className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Código</Label>
                    <Input
                      value={srvCodigo}
                      onChange={(e) => setSrvCodigo(e.target.value)}
                      placeholder="PR-001"
                      className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Fonte</Label>
                    <select
                      value={srvFonte}
                      onChange={(e) => setSrvFonte(e.target.value as FonteItem)}
                      className="w-full h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                    >
                      <option value="PROPRIA">PRÓPRIA / COTAÇÃO</option>
                      <option value="SINAPI">SINAPI</option>
                      <option value="GOINFRA">GOINFRA</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-300">Descrição do Serviço</Label>
                  <Textarea
                    value={srvDescricao}
                    onChange={(e) => setSrvDescricao(e.target.value)}
                    placeholder="Descreva o serviço detalhadamente conforme a planilha da licitação..."
                    className="text-xs min-h-[75px] bg-slate-950 border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[11px] text-slate-300">Unidade</Label>
                    <Input
                      value={srvUnidade}
                      onChange={(e) => setSrvUnidade(e.target.value.toUpperCase())}
                      placeholder="UN, M2, M3"
                      className="h-8 text-xs bg-slate-950 border-slate-700 uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Quantidade</Label>
                    <Input
                      type="number"
                      step="any"
                      value={srvQuantidade}
                      onChange={(e) => setSrvQuantidade(e.target.value)}
                      className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Custo Direto (R$)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={srvCustoManual}
                      onChange={(e) => setSrvCustoManual(e.target.value)}
                      className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-300">Teto Edital (R$)</Label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="Opcional"
                      value={srvTetoEdital}
                      onChange={(e) => setSrvTetoEdital(e.target.value)}
                      className="h-8 text-xs bg-slate-950 border-slate-700 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setServicoDialogOpen(false)}
                    className="text-xs text-slate-400"
                  >
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSalvarServicoManual}
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Serviço à Etapa
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
