"use client"

import React, { useMemo } from "react"
import type { PropostaComercial } from "@/lib/proposta-comercial/schema"
import { ROTULO_FONTE } from "@/lib/proposta-comercial/schema"
import type {
  ResultadoPropostaComercial,
  EtapaCalculadaProposta,
  ItemCalculadoProposta,
} from "@/lib/proposta-comercial/engine"
import {
  fmtMoedaBRL,
  fmtNumeroBR,
  fmtPercentualBR,
} from "@/lib/proposta-comercial/engine"
import { DECLARACOES_LEI_14133 } from "@/lib/templates"
import { ShieldCheck, FileCheck2 } from "lucide-react"

interface PropostaA4PreviewProps {
  proposta: PropostaComercial
  resultado: ResultadoPropostaComercial
  zoom?: number
}

function formatarDataExtensoBR(
  dataIso: string,
  usarDataAutomatica: boolean,
): string {
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ]
  const ref = usarDataAutomatica || !dataIso ? new Date() : new Date(`${dataIso}T12:00:00`)
  if (Number.isNaN(ref.getTime())) {
    const hoje = new Date()
    return `${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`
  }
  return `${ref.getDate()} de ${meses[ref.getMonth()]} de ${ref.getFullYear()}`
}

function formatarDataHoraSessao(dtStr: string): string {
  if (!dtStr) return "Conforme Edital"
  const [dataPart, horaPart] = dtStr.split("T")
  const [ano, mes, dia] = (dataPart || "").split("-")
  if (!ano || !mes || !dia) return dtStr
  return horaPart ? `${dia}/${mes}/${ano} às ${horaPart}h` : `${dia}/${mes}/${ano}`
}

interface BlocoPlanilhaPaginado {
  etapas: Array<{
    etapa: EtapaCalculadaProposta
    itens: ItemCalculadoProposta[]
    exibirCabecalhoEtapa: boolean
    exibirSubtotalEtapa: boolean
  }>
  exibirTotalGeral: boolean
}

export function PropostaA4Preview({
  proposta,
  resultado,
  zoom = 1,
}: PropostaA4PreviewProps) {
  const { certame, proponente, orcamento, condicoes, identidade } = proposta
  const corPrimaria = identidade.cor_primaria || "#334155"

  const declaracoesAtivas = useMemo(
    () =>
      DECLARACOES_LEI_14133.filter(
        (d) => condicoes.declaracoes[d.chave] === true,
      ),
    [condicoes.declaracoes],
  )

  // Divide os itens da planilha em blocos caso a planilha tenha muitos itens,
  // gerando múltiplas folhas A4 reais na tela com cabeçalho/rodapé e Página X de Y.
  const blocosPlanilha = useMemo<BlocoPlanilhaPaginado[]>(() => {
    const LIMITE_LINHAS_PRIMEIRA_PAGINA = 14
    const LIMITE_LINHAS_PAGINA_CONTINUACAO = 26

    const todosRegistros: Array<{
      etapa: EtapaCalculadaProposta
      item: ItemCalculadoProposta
      primeiroDaEtapa: boolean
      ultimoDaEtapa: boolean
    }> = []

    resultado.etapas.forEach((et) => {
      et.itens.forEach((it, idx) => {
        todosRegistros.push({
          etapa: et,
          item: it,
          primeiroDaEtapa: idx === 0,
          ultimoDaEtapa: idx === et.itens.length - 1,
        })
      })
    })

    if (todosRegistros.length === 0) {
      return [{ etapas: [], exibirTotalGeral: true }]
    }

    const blocos: BlocoPlanilhaPaginado[] = []
    let cursor = 0
    let idxBloco = 0

    while (cursor < todosRegistros.length) {
      const limite =
        idxBloco === 0
          ? LIMITE_LINHAS_PRIMEIRA_PAGINA
          : LIMITE_LINHAS_PAGINA_CONTINUACAO
      const fatia = todosRegistros.slice(cursor, cursor + limite)
      cursor += fatia.length
      idxBloco += 1

      const mapaEtapas = new Map<
        string,
        {
          etapa: EtapaCalculadaProposta
          itens: ItemCalculadoProposta[]
          exibirCabecalhoEtapa: boolean
          exibirSubtotalEtapa: boolean
        }
      >()

      fatia.forEach((reg) => {
        const atual = mapaEtapas.get(reg.etapa.etapa.id)
        if (!atual) {
          mapaEtapas.set(reg.etapa.etapa.id, {
            etapa: reg.etapa,
            itens: [reg.item],
            exibirCabecalhoEtapa: true,
            exibirSubtotalEtapa: reg.ultimoDaEtapa,
          })
        } else {
          atual.itens.push(reg.item)
          if (reg.ultimoDaEtapa) atual.exibirSubtotalEtapa = true
        }
      })

      blocos.push({
        etapas: Array.from(mapaEtapas.values()),
        exibirTotalGeral: cursor >= todosRegistros.length,
      })
    }

    return blocos
  }, [resultado.etapas])

  // Total de páginas A4:
  // Páginas de Identificação + Planilha (blocosPlanilha.length) + 1 Página para Cronograma, Condições, Declarações Lei 14.133 e Assinaturas
  const totalPaginas = blocosPlanilha.length + 1

  const renderCabecalhoFolha = (paginaAtual: number) => (
    <header
      className="pb-3 mb-4 border-b-2 flex items-start justify-between gap-4"
      style={{ borderColor: corPrimaria }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {identidade.logo_data_url ? (
          <img
            src={identidade.logo_data_url}
            alt="Logotipo da Empresa Proponente"
            className="h-12 w-auto max-w-[140px] object-contain shrink-0"
          />
        ) : (
          <div
            className="h-11 w-11 rounded-lg flex items-center justify-center text-white font-black text-base shrink-0 shadow-sm"
            style={{ backgroundColor: corPrimaria }}
          >
            {(proponente.razao_social || "LC")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[13px] font-black uppercase tracking-tight text-slate-900 leading-tight truncate">
            {proponente.razao_social || "RAZÃO SOCIAL DA EMPRESA PROPONENTE"}
          </h1>
          <p className="text-[9.5px] text-slate-600 font-medium">
            CNPJ: {proponente.cnpj || "00.000.000/0001-00"}
            {proponente.inscricao_estadual
              ? ` • IE: ${proponente.inscricao_estadual}`
              : ""}
            {proponente.telefone ? ` • Tel.: ${proponente.telefone}` : ""}
          </p>
          <p className="text-[9px] text-slate-500 truncate">
            {proponente.endereco
              ? `${proponente.endereco} — ${proponente.cidade_uf}`
              : proponente.cidade_uf}
            {proponente.email ? ` • ${proponente.email}` : ""}
          </p>
        </div>
      </div>

      <div className="text-right shrink-0">
        <span
          className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white mb-1"
          style={{ backgroundColor: corPrimaria }}
        >
          {certame.tipo_proposta === "readequada"
            ? "Proposta Readequada • Pós-Lances"
            : "Proposta Comercial Inicial"}
        </span>
        <p className="text-[10px] font-bold text-slate-800">
          {certame.modalidade || "Concorrência Eletrônica"} nº{" "}
          {certame.numero_edital || "000/2026"}
        </p>
        <p className="text-[9px] text-slate-500 font-mono">
          Proc.: {certame.numero_processo || "—"} • Página {paginaAtual} de{" "}
          {totalPaginas}
        </p>
      </div>
    </header>
  )

  const renderRodapeFolha = (paginaAtual: number) => (
    <footer className="pt-2.5 mt-4 border-t border-slate-300 flex items-center justify-between text-[8.5px] text-slate-500">
      <div>
        <span className="font-semibold text-slate-700">
          {proponente.razao_social}
        </span>{" "}
        • CNPJ {proponente.cnpj} • Resp. Técnico:{" "}
        {proponente.responsavel_tecnico.nome} (
        {proponente.responsavel_tecnico.conselho}-
        {proponente.responsavel_tecnico.uf}{" "}
        {proponente.responsavel_tecnico.registro})
      </div>
      <div className="font-mono font-semibold text-slate-700">
         Ref.: {certame.numero_proposta || "PROP-2026"} • Página {paginaAtual}{" "}
        de {totalPaginas}
      </div>
    </footer>
  )

  return (
    <div
      id="a4-print-root"
      className="w-full flex flex-col items-center gap-8 py-6 px-4 print:p-0 print:gap-0 transition-transform"
      style={{
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: "top center",
      }}
    >
      <style type="text/css">
        {`
          @media screen {
            .folha-a4-proposta {
              width: 210mm;
              min-height: 297mm;
              background: #ffffff;
              box-shadow: 0 20px 45px -15px rgba(2, 6, 23, 0.55);
              border-radius: 2px;
            }
          }
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body, html {
              background: #ffffff !important;
              color: #0f172a !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            #a4-print-root {
              transform: none !important;
              padding: 0 !important;
              margin: 0 !important;
              gap: 0 !important;
              display: block !important;
            }
            .folha-a4-proposta {
              width: 100% !important;
              min-height: auto !important;
              box-shadow: none !important;
              margin: 0 !important;
              padding: 6mm 4mm !important;
              page-break-after: always !important;
              break-after: page !important;
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }
            .folha-a4-proposta:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .tabela-licitacao {
              page-break-inside: auto !important;
            }
            .tabela-licitacao thead {
              display: table-header-group !important;
            }
            .tabela-licitacao tfoot {
              display: table-footer-group !important;
            }
            .tabela-licitacao tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: auto !important;
            }
            .bloco-inviolavel {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}
      </style>

      {/* =====================================================================
       * PÁGINAS 1..N-1: IDENTIFICAÇÃO DO CERTAME + PLANILHA ORÇAMENTÁRIA
       * =================================================================== */}
      {blocosPlanilha.map((bloco, idxBloco) => {
        const numeroPagina = idxBloco + 1
        const ehPrimeiraPagina = idxBloco === 0

        return (
          <section
            key={`folha-planilha-${idxBloco}`}
            className="folha-a4-proposta text-slate-900 font-sans text-[10px] leading-snug p-[14mm] flex flex-col justify-between"
          >
            <div className="space-y-4">
              {renderCabecalhoFolha(numeroPagina)}

              {ehPrimeiraPagina && (
                <>
                  {/* TÍTULO FORMAL DA PROPOSTA */}
                  <div className="text-center py-1.5 px-3 rounded border border-slate-300 bg-slate-50">
                    <h2
                      className="text-xs font-black uppercase tracking-wider"
                      style={{ color: corPrimaria }}
                    >
                      {certame.tipo_proposta === "readequada"
                        ? "PROPOSTA DE PREÇOS READEQUADA AO LANCE VENCEDOR (LEI FEDERAL Nº 14.133/2021)"
                        : "PROPOSTA COMERCIAL DE PREÇOS — OBRAS E SERVIÇOS DE ENGENHARIA (LEI FEDERAL Nº 14.133/2021)"}
                    </h2>
                  </div>

                  {/* 1. QUADRO DE IDENTIFICAÇÃO DO CERTAME E ÓRGÃO LICITANTE */}
                  <div className="border border-slate-300 rounded overflow-hidden">
                    <div
                      className="px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-white flex items-center justify-between"
                      style={{ backgroundColor: corPrimaria }}
                    >
                      <span>1. Identificação do Certame e Órgão Licitante</span>
                      <span>
                        UASG / Portal: {certame.uasg ? `${certame.uasg} • ` : ""}
                        {certame.portal || "Compras.gov.br"}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white grid grid-cols-12 gap-x-3 gap-y-1.5 text-[9.5px]">
                      <div className="col-span-7">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Órgão Público / Entidade Licitante:
                        </span>
                        <span className="font-bold text-slate-900">
                          {certame.orgao || "Não informado"}
                        </span>
                      </div>
                      <div className="col-span-5">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Aos Cuidados (A/C):
                        </span>
                        <span className="font-medium text-slate-800">
                          {certame.agente_contratacao ||
                            "Agente de Contratação / Comissão"}
                        </span>
                      </div>

                      <div className="col-span-4">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Modalidade e Nº do Edital:
                        </span>
                        <span className="font-semibold text-slate-900">
                          {certame.modalidade} nº {certame.numero_edital || "—"}
                        </span>
                      </div>
                      <div className="col-span-4">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Processo Administrativo:
                        </span>
                        <span className="font-semibold text-slate-900">
                          {certame.numero_processo || "Conforme Edital"}
                        </span>
                      </div>
                      <div className="col-span-4">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Data/Hora da Sessão • Local:
                        </span>
                        <span className="font-medium text-slate-800">
                          {formatarDataHoraSessao(certame.data_sessao)} •{" "}
                          {certame.municipio_uf}
                        </span>
                      </div>

                      <div className="col-span-12 pt-1 border-t border-slate-200">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Objeto Detalhado da Obra / Serviço de Engenharia:
                        </span>
                        <p className="text-slate-800 text-justify leading-snug">
                          {certame.objeto ||
                            "Execução de obras e serviços de engenharia conforme especificações do Edital, Projetos e Planilha Orçamentária."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. DADOS DA EMPRESA PROPONENTE, DADOS BANCÁRIOS E RESPONSÁVEL TÉCNICO */}
                  <div className="border border-slate-300 rounded overflow-hidden">
                    <div
                      className="px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wider text-white flex items-center justify-between"
                      style={{ backgroundColor: corPrimaria }}
                    >
                      <span>
                        2. Qualificação da Empresa Proponente, Dados Bancários e
                        Responsável Técnico
                      </span>
                      <span>
                        Base Ref.: {orcamento.data_base || "SINAPI"} (
                        {orcamento.desonerado ? "Desonerada" : "Não Desonerada"})
                      </span>
                    </div>
                    <div className="p-2.5 bg-white grid grid-cols-12 gap-x-3 gap-y-1.5 text-[9.5px]">
                      <div className="col-span-6">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Razão Social / CNPJ / Inscrições:
                        </span>
                        <span className="font-bold text-slate-900">
                          {proponente.razao_social}
                        </span>{" "}
                        <span className="text-slate-600">
                          (CNPJ: {proponente.cnpj}
                          {proponente.inscricao_estadual
                            ? ` • IE: ${proponente.inscricao_estadual}`
                            : ""}
                          {proponente.inscricao_municipal
                            ? ` • IM: ${proponente.inscricao_municipal}`
                            : ""}
                          )
                        </span>
                      </div>
                      <div className="col-span-6">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Dados Bancários para Empenho e Pagamento:
                        </span>
                        <span className="font-medium text-slate-800">
                          Banco: {proponente.banco.banco || "—"} • Ag.:{" "}
                          {proponente.banco.agencia || "—"} • C/C:{" "}
                          {proponente.banco.conta || "—"}
                          {proponente.banco.pix
                            ? ` • PIX: ${proponente.banco.pix}`
                            : ""}
                        </span>
                      </div>

                      <div className="col-span-6">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Representante Legal:
                        </span>
                        <span className="font-medium text-slate-800">
                          {proponente.representante.nome || "—"} — CPF:{" "}
                          {proponente.representante.cpf || "—"} (
                          {proponente.representante.cargo || "Representante Legal"}
                          )
                        </span>
                      </div>
                      <div className="col-span-6">
                        <span className="text-[8px] uppercase font-bold text-slate-500 block">
                          Responsável Técnico pela Obra:
                        </span>
                        <span className="font-medium text-slate-800">
                          {proponente.responsavel_tecnico.nome || "—"} —{" "}
                          {proponente.responsavel_tecnico.titulo} (
                          {proponente.responsavel_tecnico.conselho}-
                          {proponente.responsavel_tecnico.uf}{" "}
                          {proponente.responsavel_tecnico.registro})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PARÁGRAFO DE ENCAMINHAMENTO E PARÂMETROS DE BDI/ENCARGOS */}
                  <div className="bg-slate-50 border border-slate-300 rounded p-2.5 flex flex-wrap items-center justify-between gap-2 text-[9px]">
                    <div>
                      <strong>BDI Serviços:</strong>{" "}
                      {fmtPercentualBR(orcamento.bdi_normal_pct)}
                      {orcamento.usar_bdi_diferenciado && (
                        <>
                          {" "}
                          • <strong>BDI Diferenciado (Equip.):</strong>{" "}
                          {fmtPercentualBR(orcamento.bdi_diferenciado_pct)}
                        </>
                      )}{" "}
                      • <strong>Encargos Sociais:</strong> Horista{" "}
                      {fmtPercentualBR(orcamento.encargos_horista_pct)} /
                      Mensalista{" "}
                      {fmtPercentualBR(orcamento.encargos_mensalista_pct)} •{" "}
                      <strong>Critério TCU:</strong>{" "}
                      {orcamento.arredondamento === "truncar"
                        ? "Truncamento (2 casas)"
                        : "Arredondamento (2 casas)"}
                    </div>
                    {orcamento.disputa.aplicada && (
                      <div className="font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                        Desconto Linear de Disputa Aplicado:{" "}
                        {fmtPercentualBR(resultado.desconto_linear_efetivo_pct)}{" "}
                        (Economia: {fmtMoedaBRL(resultado.economia_disputa_rs)})
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 3. PLANILHA ORÇAMENTÁRIA DE SERVIÇOS DE ENGENHARIA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3
                    className="text-[10.5px] font-black uppercase tracking-wider"
                    style={{ color: corPrimaria }}
                  >
                    3. Planilha Orçamentária de Custos e Preços Unitários
                    {!ehPrimeiraPagina ? " (Continuação)" : ""}
                  </h3>
                  <span className="text-[8.5px] text-slate-500 font-mono">
                    Valores expressos em Reais (R$)
                  </span>
                </div>

                <table className="tabela-licitacao w-full border-collapse border border-slate-300 text-[8.8px]">
                  <thead>
                    <tr
                      className="text-white font-bold"
                      style={{ backgroundColor: corPrimaria }}
                    >
                      <th className="border border-slate-300 p-1 w-9 text-center">
                        Item
                      </th>
                      <th className="border border-slate-300 p-1 w-20 text-left">
                        Código / Fonte
                      </th>
                      <th className="border border-slate-300 p-1 text-left">
                        Descrição do Serviço de Engenharia
                      </th>
                      <th className="border border-slate-300 p-1 w-9 text-center">
                        Und.
                      </th>
                      <th className="border border-slate-300 p-1 w-14 text-right">
                        Quant.
                      </th>
                      <th className="border border-slate-300 p-1 w-20 text-right">
                        Custo S/ BDI
                      </th>
                      <th className="border border-slate-300 p-1 w-20 text-right">
                        Valor C/ BDI
                      </th>
                      <th className="border border-slate-300 p-1 w-24 text-right">
                        Valor Total (R$)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloco.etapas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="border border-slate-300 p-4 text-center text-slate-400 italic"
                        >
                          Nenhum item cadastrado na planilha orçamentária.
                        </td>
                      </tr>
                    ) : (
                      bloco.etapas.map((grupo) => (
                        <React.Fragment key={grupo.etapa.etapa.id}>
                          {grupo.exibirCabecalhoEtapa && (
                            <tr className="bg-slate-100 font-bold text-slate-900">
                              <td className="border border-slate-300 p-1 text-center font-mono">
                                {grupo.etapa.item_etapa}
                              </td>
                              <td
                                colSpan={6}
                                className="border border-slate-300 p-1 uppercase tracking-wide"
                              >
                                {grupo.etapa.etapa.descricao}
                              </td>
                              <td className="border border-slate-300 p-1 text-right font-mono">
                                {fmtMoedaBRL(grupo.etapa.subtotal_com_bdi)}
                              </td>
                            </tr>
                          )}

                          {grupo.itens.map((it) => (
                            <tr key={it.servico.id} className="hover:bg-slate-50">
                              <td className="border border-slate-300 p-1 text-center font-mono text-slate-600">
                                {it.item_hierarquia}
                              </td>
                              <td className="border border-slate-300 p-1 font-mono text-[8px] text-slate-700">
                                {it.servico.codigo} •{" "}
                                {ROTULO_FONTE[it.servico.fonte]}
                              </td>
                              <td className="border border-slate-300 p-1 text-slate-900">
                                {it.servico.descricao}
                                {orcamento.usar_bdi_diferenciado &&
                                  it.servico.bdi_tipo === "diferenciado" && (
                                    <span className="ml-1 text-[7.5px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-1 rounded">
                                      BDI Dif. ({fmtPercentualBR(it.bdi_aplicado_pct)})
                                    </span>
                                  )}
                              </td>
                              <td className="border border-slate-300 p-1 text-center uppercase text-slate-700">
                                {it.servico.unidade}
                              </td>
                              <td className="border border-slate-300 p-1 text-right font-mono">
                                {fmtNumeroBR(it.servico.quantidade, 2)}
                              </td>
                              <td className="border border-slate-300 p-1 text-right font-mono text-slate-700">
                                {fmtMoedaBRL(it.custo_unitario_sem_bdi)}
                              </td>
                              <td className="border border-slate-300 p-1 text-right font-mono font-semibold text-slate-900">
                                {fmtMoedaBRL(it.preco_unitario_com_bdi)}
                              </td>
                              <td className="border border-slate-300 p-1 text-right font-mono font-bold text-slate-900">
                                {fmtMoedaBRL(it.total_item)}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>

                  {bloco.exibirTotalGeral && (
                    <tfoot>
                      <tr className="bg-slate-100 font-semibold text-slate-800">
                        <td
                          colSpan={5}
                          className="border border-slate-300 p-1.5 text-right uppercase text-[8.5px]"
                        >
                          Total Custo Direto Sem BDI:
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">
                          {fmtMoedaBRL(resultado.total_custo_sem_bdi)}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right uppercase text-[8.5px]">
                          Parcela BDI:
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">
                          {fmtMoedaBRL(resultado.total_bdi_rs)}
                        </td>
                      </tr>
                      <tr
                        className="text-white font-black text-[9.5px]"
                        style={{ backgroundColor: corPrimaria }}
                      >
                        <td
                          colSpan={7}
                          className="border border-slate-300 p-1.5 text-right uppercase tracking-wider"
                        >
                          Valor Global da Proposta{" "}
                          {certame.tipo_proposta === "readequada"
                            ? "Readequada"
                            : "Comercial"}{" "}
                          (Com BDI):
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono text-[10px]">
                          {fmtMoedaBRL(resultado.valor_global_proposta)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                {bloco.exibirTotalGeral && (
                  <div
                    className="p-2.5 rounded border text-[9.5px] bloco-inviolavel"
                    style={{
                      borderColor: corPrimaria,
                      backgroundColor: `${corPrimaria}0D`,
                    }}
                  >
                    <span
                      className="font-black uppercase tracking-wide"
                      style={{ color: corPrimaria }}
                    >
                      Valor Global por Extenso:{" "}
                    </span>
                    <span className="font-bold text-slate-900">
                      {fmtMoedaBRL(resultado.valor_global_proposta)} (
                      {resultado.valor_por_extenso}).
                    </span>
                  </div>
                )}
              </div>
            </div>

            {renderRodapeFolha(numeroPagina)}
          </section>
        )
      })}

      {/* =====================================================================
       * PÁGINA FINAL: CRONOGRAMA FÍSICO-FINANCEIRO, CONDIÇÕES, DECLARAÇÕES LEI 14.133 E ASSINATURAS
       * =================================================================== */}
      <section className="folha-a4-proposta text-slate-900 font-sans text-[10px] leading-snug p-[14mm] flex flex-col justify-between">
        <div className="space-y-4">
          {renderCabecalhoFolha(totalPaginas)}

          {/* 4. CRONOGRAMA FÍSICO-FINANCEIRO */}
          <div className="space-y-1.5 bloco-inviolavel">
            <div className="flex items-center justify-between">
              <h3
                className="text-[10.5px] font-black uppercase tracking-wider"
                style={{ color: corPrimaria }}
              >
                4. Cronograma Físico-Financeiro de Execução e Desembolso
              </h3>
              <span className="text-[8.5px] text-slate-600 font-medium">
                Prazo: {resultado.cronograma.num_periodos}{" "}
                {resultado.cronograma.rotulo_periodo}(s)
              </span>
            </div>

            <table className="tabela-licitacao w-full border-collapse border border-slate-300 text-[8.5px]">
              <thead>
                <tr
                  className="text-white font-bold"
                  style={{ backgroundColor: corPrimaria }}
                >
                  <th className="border border-slate-300 p-1 w-8 text-center">
                    Item
                  </th>
                  <th className="border border-slate-300 p-1 text-left">
                    Etapa / Macroitem da Obra
                  </th>
                  <th className="border border-slate-300 p-1 w-20 text-right">
                    Valor (R$)
                  </th>
                  <th className="border border-slate-300 p-1 w-11 text-right">
                    Peso
                  </th>
                  {Array.from(
                    { length: resultado.cronograma.num_periodos },
                    (_, idx) => (
                      <th
                        key={idx}
                        className="border border-slate-300 p-1 text-center"
                      >
                        {resultado.cronograma.rotulo_periodo} {idx + 1}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {resultado.cronograma.linhas.map((linha) => (
                  <tr key={linha.etapa_id}>
                    <td className="border border-slate-300 p-1 text-center font-mono font-bold">
                      {linha.item_etapa}
                    </td>
                    <td className="border border-slate-300 p-1 font-medium text-slate-900">
                      {linha.descricao}
                    </td>
                    <td className="border border-slate-300 p-1 text-right font-mono font-semibold">
                      {fmtMoedaBRL(linha.valor_etapa)}
                    </td>
                    <td className="border border-slate-300 p-1 text-right font-mono text-slate-600">
                      {fmtPercentualBR(linha.peso_etapa_pct, 1)}
                    </td>
                    {linha.valores_periodo.map((v, pIdx) => (
                      <td
                        key={pIdx}
                        className="border border-slate-300 p-1 text-right font-mono"
                      >
                        <div className="font-semibold text-slate-900">
                          {fmtMoedaBRL(v)}
                        </div>
                        <div className="text-[7.5px] text-slate-500">
                          ({fmtPercentualBR(linha.percentuais_periodo[pIdx], 1)})
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td
                    colSpan={4}
                    className="border border-slate-300 p-1 text-right uppercase text-[8px]"
                  >
                    Desembolso Simples no Período (R$ / %):
                  </td>
                  {resultado.cronograma.desembolso_periodo.map((val, idx) => (
                    <td
                      key={idx}
                      className="border border-slate-300 p-1 text-right font-mono"
                    >
                      <div>{fmtMoedaBRL(val)}</div>
                      <div className="text-[7.5px] text-slate-600">
                        (
                        {fmtPercentualBR(
                          resultado.cronograma.avanco_fisico_periodo_pct[idx],
                        )}
                        )
                      </div>
                    </td>
                  ))}
                </tr>
                <tr
                  className="text-white font-bold"
                  style={{ backgroundColor: corPrimaria }}
                >
                  <td
                    colSpan={4}
                    className="border border-slate-300 p-1 text-right uppercase text-[8px]"
                  >
                    Desembolso e Avanço Acumulado (R$ / %):
                  </td>
                  {resultado.cronograma.desembolso_acumulado.map((acum, idx) => (
                    <td
                      key={idx}
                      className="border border-slate-300 p-1 text-right font-mono"
                    >
                      <div>{fmtMoedaBRL(acum)}</div>
                      <div className="text-[7.5px] opacity-90">
                        (
                        {fmtPercentualBR(
                          resultado.cronograma.avanco_fisico_acumulado_pct[idx],
                        )}
                        )
                      </div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 5. CONDIÇÕES COMERCIAIS E PRAZOS */}
          <div className="space-y-1.5 bloco-inviolavel">
            <h3
              className="text-[10.5px] font-black uppercase tracking-wider"
              style={{ color: corPrimaria }}
            >
              5. Condições Comerciais, Prazos e Garantia Legal
            </h3>
            <div className="grid grid-cols-3 gap-2.5 bg-slate-50 p-2.5 rounded border border-slate-300 text-[9px]">
              <div>
                <span className="text-[8px] font-bold uppercase text-slate-500 block">
                  Prazo de Validade da Proposta:
                </span>
                <span className="font-bold text-slate-900">
                  {condicoes.validade_dias} (
                  {condicoes.validade_dias === 60
                    ? "sessenta"
                    : condicoes.validade_dias === 90
                    ? "noventa"
                    : condicoes.validade_dias}
                  ) dias corridos
                </span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase text-slate-500 block">
                  Prazo de Execução da Obra:
                </span>
                <span className="font-bold text-slate-900">
                  {condicoes.prazo_execucao} {condicoes.prazo_execucao_unidade} a
                  partir da Ordem de Serviço
                </span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase text-slate-500 block">
                  Garantia Qüinqüenal da Obra:
                </span>
                <span className="font-bold text-slate-900">
                  {condicoes.prazo_garantia_anos} (cinco) anos — Art. 618 do
                  Código Civil
                </span>
              </div>
              <div className="col-span-3 pt-1 border-t border-slate-200">
                <span className="text-[8px] font-bold uppercase text-slate-500 block">
                  Condições de Medição e Pagamento:
                </span>
                <p className="text-slate-800">{condicoes.condicoes_pagamento}</p>
              </div>
            </div>
          </div>

          {/* 6. DECLARAÇÕES LEGAIS OBRIGATÓRIAS (LEI FEDERAL Nº 14.133/2021) */}
          {declaracoesAtivas.length > 0 && (
            <div className="space-y-1.5 bloco-inviolavel">
              <h3
                className="text-[10.5px] font-black uppercase tracking-wider"
                style={{ color: corPrimaria }}
              >
                6. Declarações Legais Obrigatórias (Lei Federal nº 14.133/2021)
              </h3>
              <div className="space-y-1.5 border border-slate-300 rounded p-2.5 bg-white text-[8.8px] text-justify">
                {declaracoesAtivas.map((decl, idx) => (
                  <p key={decl.chave} className="leading-snug text-slate-800">
                    <strong>
                      6.{idx + 1}. ({decl.fundamentoLegal}):
                    </strong>{" "}
                    {decl.texto}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* 7. OBSERVAÇÕES COMPLEMENTARES / EXIGÊNCIAS ESPECÍFICAS DO EDITAL */}
          {condicoes.observacoes_html &&
            condicoes.observacoes_html.trim() !== "" && (
              <div className="space-y-1 bloco-inviolavel">
                <h3
                  className="text-[10.5px] font-black uppercase tracking-wider"
                  style={{ color: corPrimaria }}
                >
                  7. Observações Complementares e Especificidades do Certame
                </h3>
                <div
                  className="border border-slate-300 rounded p-2.5 bg-slate-50 text-[8.8px] text-slate-800 space-y-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                  dangerouslySetInnerHTML={{
                    __html: condicoes.observacoes_html,
                  }}
                />
              </div>
            )}

          {/* LOCAL, DATA E BLOCO DUPLO DE ASSINATURAS INVIOLÁVEL */}
          <div className="pt-3 space-y-5 bloco-inviolavel">
            <p className="text-right text-[9.5px] font-semibold text-slate-800">
              {identidade.local ||
                proponente.cidade_uf ||
                certame.municipio_uf ||
                "Goiânia/GO"}
              ,{" "}
              {formatarDataExtensoBR(
                identidade.data_documento,
                identidade.data_automatica,
              )}
              .
            </p>

            <div className="grid grid-cols-2 gap-8 pt-2">
              {/* ASSINATURA 1: REPRESENTANTE LEGAL */}
              <div className="flex flex-col items-center text-center">
                <div className="h-14 flex items-end justify-center w-full mb-1">
                  {identidade.assinatura_modo === "imagem" &&
                  identidade.assinatura_representante_url ? (
                    <img
                      src={identidade.assinatura_representante_url}
                      alt="Assinatura Representante Legal"
                      className="max-h-14 w-auto object-contain"
                    />
                  ) : identidade.assinatura_modo === "digital" ? (
                    <div className="border border-slate-400 bg-slate-100 text-slate-800 rounded px-2.5 py-1 text-[8px] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0" />
                      <div className="text-left leading-tight">
                        <span className="font-bold block uppercase">
                          Assinado Digitalmente (ICP-Brasil / Gov.br)
                        </span>
                        <span>
                          Titular:{" "}
                          {proponente.representante.nome ||
                            proponente.razao_social}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="w-full border-t border-slate-800 pt-1.5">
                  <p className="font-black text-[9.5px] text-slate-900 uppercase">
                    {proponente.representante.nome || "Representante Legal"}
                  </p>
                  <p className="text-[8.5px] text-slate-700 font-medium">
                    CPF: {proponente.representante.cpf || "—"} •{" "}
                    {proponente.representante.cargo || "Representante Legal"}
                  </p>
                  <p className="text-[8px] text-slate-500 uppercase">
                    {proponente.razao_social} (CNPJ: {proponente.cnpj})
                  </p>
                </div>
              </div>

              {/* ASSINATURA 2: RESPONSÁVEL TÉCNICO (CREA / CAU) */}
              <div className="flex flex-col items-center text-center">
                <div className="h-14 flex items-end justify-center w-full mb-1">
                  {identidade.assinatura_modo === "imagem" &&
                  identidade.assinatura_responsavel_url ? (
                    <img
                      src={identidade.assinatura_responsavel_url}
                      alt="Assinatura Responsável Técnico"
                      className="max-h-14 w-auto object-contain"
                    />
                  ) : identidade.assinatura_modo === "digital" ? (
                    <div className="border border-slate-400 bg-slate-100 text-slate-800 rounded px-2.5 py-1 text-[8px] flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-slate-700 shrink-0" />
                      <div className="text-left leading-tight">
                        <span className="font-bold block uppercase">
                          Assinado Digitalmente (ICP-Brasil / CREA-CAU)
                        </span>
                        <span>
                          RT: {proponente.responsavel_tecnico.nome} •{" "}
                          {proponente.responsavel_tecnico.conselho}-
                          {proponente.responsavel_tecnico.uf}{" "}
                          {proponente.responsavel_tecnico.registro}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="w-full border-t border-slate-800 pt-1.5">
                  <p className="font-black text-[9.5px] text-slate-900 uppercase">
                    {proponente.responsavel_tecnico.nome ||
                      "Responsável Técnico"}
                  </p>
                  <p className="text-[8.5px] text-slate-700 font-medium">
                    {proponente.responsavel_tecnico.titulo} •{" "}
                    {proponente.responsavel_tecnico.conselho}/
                    {proponente.responsavel_tecnico.uf} nº{" "}
                    {proponente.responsavel_tecnico.registro}
                  </p>
                  <p className="text-[8px] text-slate-500 uppercase">
                    Responsável Técnico pela Obra / Serviço de Engenharia
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {renderRodapeFolha(totalPaginas)}
      </section>
    </div>
  )
}

