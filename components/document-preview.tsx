"use client"

import React from "react"
import type { OrcamentoLicita } from "@/lib/proposal-types"
import { valorExtenso } from "@/lib/proposal-types"
import type { ResultadoOrcamento } from "@/lib/budget-engine"
import { fmtBRL, fmtNum, fmtPct, MODELO_BASE_PADRAO } from "@/lib/budget-engine"

interface DocumentPreviewProps {
  orcamento: OrcamentoLicita
  resultado: ResultadoOrcamento
  zoom?: number
}

function safeFormatDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toLocaleDateString("pt-BR")
  const parts = dateStr.split("-")
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

export function DocumentPreview({ orcamento, resultado, zoom = 1 }: DocumentPreviewProps) {
  const { edital, desonerado } = orcamento
  const bdi = resultado.bdi
  const modelo = orcamento.modelo_base || MODELO_BASE_PADRAO

  return (
    <div
      className="w-full flex justify-center p-6 print:p-0 print:bg-white overflow-auto print:overflow-visible transition-all"
      style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: "top center" }}
    >
      <style type="text/css">
        {`
          @media screen {
            #preview-wrapper {
              background-color: white;
              box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45);
              width: 210mm;
              min-height: 297mm;
            }
          }
          @media print {
            #preview-wrapper {
              width: 100% !important;
              max-width: none !important;
              min-height: 297mm !important;
              margin: 0 !important;
              background-color: white !important;
              box-shadow: none !important;
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }
            .avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
            .page-break { page-break-before: always !important; }
          }
        `}
      </style>

      {/* Folha A4 seguindo o Modelo Base de Proposta de Licitação (Lei 14.133/2021) */}
      <div
        id="preview-wrapper"
        className="relative text-slate-900 bg-white font-sans text-xs leading-normal p-[2cm]"
      >
        <div className="relative z-10 space-y-5">
          {/* CABEÇALHO DO MODELO BASE */}
          <div className="border-b-2 border-emerald-900/80 pb-3 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
                {edital.empresa_licitante || "CONSTRUTORA E ENGENHARIA MODELO LTDA"}
              </h1>
              <p className="text-[10px] text-slate-600">
                CNPJ: {edital.cnpj_licitante || "00.000.000/0001-00"} • Contato: {modelo.telefone_contato || "(62) 3000-0000"}
              </p>
            </div>
            <div className="text-right text-[11px]">
              <span className="font-bold text-emerald-900 uppercase block">
                PROPOSTA DE PREÇOS — LICITAÇÃO
              </span>
              <span className="text-slate-800 font-semibold text-[10px] block">
                Ref.: {edital.numero_edital || modelo.num_proposta || "PROP-2026"}
              </span>
              <p className="text-slate-600 font-mono text-[10px]">
                {edital.local || edital.municipio_uf || "Goiânia/GO"}, {safeFormatDate(edital.data_proposta)}
              </p>
            </div>
          </div>

          {/* QUADRO DE IDENTIFICAÇÃO DO CLIENTE / LICITAÇÃO */}
          <div className="bg-slate-50/95 p-3.5 rounded-lg border border-slate-300 grid grid-cols-2 gap-2.5 text-[10.5px]">
            <div>
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Órgão Licitante / Cliente:</span>
              <span className="font-semibold text-slate-900">{edital.orgao || edital.cliente || "Não informado"}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Edital / Processo / Proposta:</span>
              <span className="font-semibold text-slate-900">
                {edital.numero_edital || modelo.num_proposta || "Não informado"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Aos Cuidados de (A/C):</span>
              <span className="font-medium text-slate-800">{modelo.aos_cuidados || "Comissão de Licitação / Engenharia"}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Local / Endereço da Obra:</span>
              <span className="font-medium text-slate-800">
                {modelo.endereco_obra || edital.municipio_uf || "Conforme Edital"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Objeto / Escopo dos Serviços:</span>
              <p className="text-slate-800 leading-snug">{edital.objeto || "Execução de serviços de engenharia conforme planilha orçamentária."}</p>
            </div>
            <div>
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Regime Tributário da Planilha:</span>
              <span className="font-medium text-slate-800">
                {desonerado ? "Desonerado (Lei 12.844/2013 - CPRB 4,5%)" : "Não Desonerado"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[9px] block uppercase font-bold">Prazo de Execução / Validade:</span>
              <span className="font-medium text-slate-800">
                {orcamento.cronograma.prazo_meses} {orcamento.cronograma.prazo_meses === 1 ? "Mês" : "Meses"} • Validade: {edital.validade_dias || 60} dias
              </span>
            </div>
          </div>

          {/* APRESENTAÇÃO DO MODELO BASE */}
          {modelo.introducao_texto && (
            <div className="text-[10.5px] text-slate-800 leading-relaxed text-justify">
              <p>{modelo.introducao_texto}</p>
            </div>
          )}

          {/* 1. PLANILHA ORÇAMENTÁRIA SINTÉTICA */}
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 border-b border-slate-300 pb-1">
              1. Planilha Orçamentária Sintética de Serviços
            </h2>
            <table className="w-full text-[9.5px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold">
                  <th className="border border-slate-300 p-1.5 w-10 text-center">Item</th>
                  <th className="border border-slate-300 p-1.5 w-20">Código</th>
                  <th className="border border-slate-300 p-1.5">Discriminação dos Serviços</th>
                  <th className="border border-slate-300 p-1.5 w-10 text-center">Und</th>
                  <th className="border border-slate-300 p-1.5 w-14 text-right">Qtd</th>
                  <th className="border border-slate-300 p-1.5 w-24 text-right">P.U. c/ BDI</th>
                  <th className="border border-slate-300 p-1.5 w-26 text-right">Total (R$)</th>
                </tr>
              </thead>
              <tbody>
                {resultado.etapas.map((et) => (
                  <React.Fragment key={et.etapa.id}>
                    <tr className="bg-slate-100/80 font-bold text-slate-900">
                      <td className="border border-slate-300 p-1 text-center">{et.etapa.item}</td>
                      <td colSpan={5} className="border border-slate-300 p-1 uppercase">
                        {et.etapa.descricao}
                      </td>
                      <td className="border border-slate-300 p-1 text-right font-mono">
                        {fmtBRL(et.total)}
                      </td>
                    </tr>
                    {et.servicos.map((s) => (
                      <tr key={s.servico.id}>
                        <td className="border border-slate-300 p-1 text-center text-slate-600">{s.servico.item}</td>
                        <td className="border border-slate-300 p-1 font-mono text-[8.5px] text-slate-600">
                          {s.servico.codigo} ({s.servico.fonte})
                        </td>
                        <td className="border border-slate-300 p-1 text-slate-800 leading-snug">
                          {s.servico.descricao}
                        </td>
                        <td className="border border-slate-300 p-1 text-center uppercase text-slate-600">
                          {s.servico.unidade}
                        </td>
                        <td className="border border-slate-300 p-1 text-right font-mono">
                          {fmtNum(s.servico.quantidade)}
                        </td>
                        <td className="border border-slate-300 p-1 text-right font-mono">
                          {fmtBRL(s.preco_unitario)}
                        </td>
                        <td className="border border-slate-300 p-1 text-right font-mono font-medium">
                          {fmtBRL(s.total)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 font-bold text-[10.5px]">
                  <td colSpan={6} className="border border-slate-300 p-1.5 text-right uppercase">
                    Valor Global da Proposta (c/ BDI de {fmtPct(bdi.bdi_percentual)}):
                  </td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono text-emerald-900">
                    {fmtBRL(resultado.valor_global)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* VALOR POR EXTENSO */}
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-[10.5px] text-emerald-950">
            <strong>Valor Global por Extenso:</strong> {fmtBRL(resultado.valor_global)} (
            {valorExtenso(resultado.valor_global)}).
          </div>

          {/* 2. METODOLOGIA TÉCNICA (MODELO BASE) */}
          {modelo.metodologia_tecnica && (
            <div className="space-y-1 avoid-break">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 border-b border-slate-300 pb-1">
                2. Metodologia Técnica e Diretrizes de Execução
              </h2>
              <p className="text-[10px] text-slate-800 leading-relaxed text-justify">
                {modelo.metodologia_tecnica}
              </p>
            </div>
          )}

          {/* 3. DEMONSTRATIVO DE BDI (TCU) */}
          {modelo.exibir_bdi_proposta && (
            <div className="space-y-1.5 avoid-break">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 border-b border-slate-300 pb-1">
                3. Composição Analítica do BDI (Acórdão 2.622/2013 - TCU)
              </h2>
              <div className="grid grid-cols-2 gap-4 text-[9.5px]">
                <table className="w-full border-collapse border border-slate-300">
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">Administração Central (AC)</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.ac)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">Seguros (S) + Garantias (G)</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">
                        {fmtPct(orcamento.bdi.s + orcamento.bdi.g)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">Riscos (R)</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.r)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">Despesas Financeiras (DF)</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.df)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">Lucro Bruto (L)</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.lucro)}</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full border-collapse border border-slate-300">
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">PIS</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.pis)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">COFINS</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.cofins)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">ISS</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtPct(orcamento.bdi.iss)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-1 font-medium">CPRB (Desoneração)</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">
                        {desonerado ? "4,50%" : "0,00%"}
                      </td>
                    </tr>
                    <tr className="bg-emerald-100 font-bold text-emerald-900">
                      <td className="border border-slate-300 p-1">BDI CALCULADO</td>
                      <td className="border border-slate-300 p-1 text-right font-mono">
                        {fmtPct(bdi.bdi_percentual)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. RESUMO DO CRONOGRAMA FÍSICO-FINANCEIRO */}
          {modelo.exibir_cronograma_proposta && resultado.cronograma.linhas.length > 0 && (
            <div className="space-y-1.5 avoid-break">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 border-b border-slate-300 pb-1">
                4. Cronograma Físico-Financeiro de Desembolso
              </h2>
              <table className="w-full text-[9px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold">
                    <th className="border border-slate-300 p-1 text-left">Etapa</th>
                    <th className="border border-slate-300 p-1 text-right w-24">Total Etapa</th>
                    {Array.from({ length: resultado.cronograma.meses }, (_, i) => (
                      <th key={i} className="border border-slate-300 p-1 text-center">
                        Mês {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.cronograma.linhas.map((l) => (
                    <tr key={l.etapa_id}>
                      <td className="border border-slate-300 p-1 font-medium text-slate-800">
                        {l.item}. {l.descricao}
                      </td>
                      <td className="border border-slate-300 p-1 text-right font-mono">{fmtBRL(l.total)}</td>
                      {l.valores.map((v, idx) => (
                        <td key={idx} className="border border-slate-300 p-1 text-center font-mono">
                          <div>{fmtBRL(v)}</div>
                          <div className="text-[8px] text-slate-500">({fmtPct(l.percentuais[idx], 1)})</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. CONDIÇÕES COMERCIAIS E OBSERVAÇÕES DO MODELO BASE */}
          <div className="space-y-2 avoid-break text-[10px]">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 border-b border-slate-300 pb-1">
              5. Condições Comerciais e Observações Gerais
            </h2>
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
              <p>
                <strong>Condições de Pagamento:</strong> {modelo.condicoes_pagamento}
              </p>
              <p>
                <strong>Prazo de Execução:</strong> {orcamento.cronograma.prazo_meses}{" "}
                {orcamento.cronograma.prazo_meses === 1 ? "mês" : "meses"} conforme cronograma físico-financeiro.
              </p>
              <p>
                <strong>Validade da Proposta:</strong> {edital.validade_dias || 60} dias corridos a contar da data de emissão.
              </p>
            </div>

            {modelo.observacoes && modelo.observacoes.length > 0 && (
              <ol className="list-decimal pl-4 space-y-0.5 text-slate-700 text-[9.5px]">
                {modelo.observacoes.map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ol>
            )}
          </div>

          {/* 6. ASSINATURAS */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center avoid-break">
            <div>
              <div className="border-b border-slate-700 mb-1 mx-6" />
              <p className="font-bold text-[10.5px] text-slate-900">
                {edital.empresa_licitante || "CONSTRUTORA E ENGENHARIA MODELO LTDA"}
              </p>
              <p className="text-[9.5px] text-slate-500">
                CNPJ: {edital.cnpj_licitante || "00.000.000/0001-00"} • Representante Legal
              </p>
            </div>
            <div>
              <div className="border-b border-slate-700 mb-1 mx-6" />
              <p className="font-bold text-[10.5px] text-slate-900">
                {edital.responsavel_tecnico || "Eng. Civil Responsável Técnico"}
              </p>
              <p className="text-[9.5px] text-slate-500">
                Responsável Técnico • {edital.registro_profissional || "CREA / CAU"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}