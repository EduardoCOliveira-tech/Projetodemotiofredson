"use client"

import type { OrcamentoLicita } from "@/lib/proposal-types"
import type { ResultadoOrcamento } from "@/lib/budget-engine"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/budget-engine"
import { Input } from "@/components/ui/input"

interface ScheduleTableProps {
  orcamento: OrcamentoLicita
  resultado: ResultadoOrcamento
  onUpdateOrcamento: (orc: OrcamentoLicita) => void
}

export function ScheduleTable({
  orcamento,
  resultado,
  onUpdateOrcamento
}: ScheduleTableProps) {
  const { cronograma } = resultado
  const meses = cronograma.meses

  const handleUpdateDistribuicao = (etapaId: string, mesIndex: number, valStr: string) => {
    const val = parseFloat(valStr) || 0
    const distAtual = orcamento.cronograma.distribuicao[etapaId] || new Array(meses).fill(0)
    const novaDist = [...distAtual]
    novaDist[mesIndex] = val

    onUpdateOrcamento({
      ...orcamento,
      cronograma: {
        ...orcamento.cronograma,
        distribuicao: {
          ...orcamento.cronograma.distribuicao,
          [etapaId]: novaDist
        }
      },
      atualizado_em: new Date().toISOString()
    })
  }

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl p-4 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Cronograma Físico-Financeiro
          </h2>
          <p className="text-[11px] text-slate-400">
            Vinculado reativamente aos totais calculados das etapas da planilha.
          </p>
        </div>
        <div className="text-right font-mono text-xs text-emerald-400 font-bold">
          Total: {fmtBRL(resultado.valor_global)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <th className="py-2.5 px-3 w-14 text-center">Item</th>
              <th className="py-2.5 px-3 min-w-[200px]">Etapa</th>
              <th className="py-2.5 px-3 text-right w-28">Total (R$)</th>
              {Array.from({ length: meses }, (_, i) => (
                <th key={i} className="py-2.5 px-2 text-center min-w-[90px]">
                  Mês {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {cronograma.linhas.map((row) => (
              <tr key={row.etapa_id} className="hover:bg-slate-800/40">
                <td className="py-2.5 px-3 text-center text-slate-400">{row.item}</td>
                <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                  {row.descricao}
                  <div className="text-[10px] text-slate-400 font-mono">
                    Soma: {row.soma_percentual.toFixed(1)}%
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                  {fmtBRL(row.total)}
                </td>
                {row.percentuais.map((pct, mIdx) => (
                  <td key={mIdx} className="py-2 px-1 text-center bg-slate-950/20">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-0.5">
                        <Input
                          type="number"
                          step="1"
                          value={pct}
                          onChange={(e) =>
                            handleUpdateDistribuicao(row.etapa_id, mIdx, e.target.value)
                          }
                          className="h-6 w-14 text-right bg-slate-900 border-slate-700 text-[10px] px-1 font-mono text-emerald-400"
                        />
                        <span className="text-slate-500 text-[10px]">%</span>
                      </div>
                      <span className="text-[9px] text-slate-400">
                        {fmtBRL(row.valores[mIdx])}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Linha de Total do Mês */}
            <tr className="bg-slate-950 border-t-2 border-slate-700 text-slate-200 font-bold text-[11px]">
              <td colSpan={2} className="py-2.5 px-3 text-right uppercase text-slate-400 font-sans">
                Total Mensal:
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                {fmtBRL(resultado.valor_global)}
              </td>
              {cronograma.total_mes.map((tot, i) => (
                <td key={i} className="py-2.5 px-2 text-center font-mono text-slate-200">
                  <div>{fmtBRL(tot)}</div>
                  <div className="text-[9px] text-slate-400 font-normal">
                    {fmtPct(cronograma.percentual_mes[i])}
                  </div>
                </td>
              ))}
            </tr>

            {/* Linha Acumulada */}
            <tr className="bg-slate-950/80 text-slate-300 font-bold text-[11px]">
              <td colSpan={2} className="py-2 px-3 text-right uppercase text-slate-400 font-sans">
                Acumulado Financeiro:
              </td>
              <td className="py-2 px-3 text-right font-mono text-slate-400">100%</td>
              {cronograma.acumulado_mes.map((acc, i) => (
                <td key={i} className="py-2 px-2 text-center font-mono text-emerald-300">
                  <div>{fmtBRL(acc)}</div>
                  <div className="text-[9px] text-emerald-400 font-normal">
                    {fmtPct(cronograma.percentual_acumulado[i])}
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}