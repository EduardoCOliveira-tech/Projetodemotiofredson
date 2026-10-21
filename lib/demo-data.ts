// lib/demo-data.ts
// Base e orçamento de DEMONSTRAÇÃO — valores FICTÍCIOS, apenas para validar o
// motor reativo sem Firestore/IA configurados. Não usar em propostas reais.

import type { AiEditalResponse, BaseReferencia, ComposicaoCPU, InsumoBase, TipoInsumo } from "./proposal-types"

export const DEMO_BASE_ID = "DEMO-SINAPI-GO-2026-05"

const ins = (codigo: string, descricao: string, unidade: string, preco: number, precoDes: number, tipo: TipoInsumo): InsumoBase => ({
  id: `SINAPI:${codigo}`, codigo, fonte: "SINAPI", descricao, unidade, preco_base: preco, preco_base_desonerado: precoDes, tipo,
})

const comp = (
  codigo: string, descricao: string, unidade: string,
  insumos: Array<[string, number]>, auxiliares: Array<[string, number]> = [],
): ComposicaoCPU => ({
  id: `SINAPI:${codigo}`, codigo, fonte: "SINAPI", descricao, unidade,
  insumos: insumos.map(([c, coeficiente]) => ({ id_insumo: `SINAPI:${c}`, coeficiente })),
  composicoes_auxiliares: auxiliares.map(([c, coeficiente]) => ({ id_composicao: `SINAPI:${c}`, coeficiente })),
})

const insumos: InsumoBase[] = [
  ins("D0101", "SERVENTE DE OBRAS (COM ENCARGOS)", "H", 22.5, 20.1, "MaoDeObra"),
  ins("D0102", "PEDREIRO (COM ENCARGOS)", "H", 28.9, 25.7, "MaoDeObra"),
  ins("D0103", "CARPINTEIRO DE FORMAS (COM ENCARGOS)", "H", 28.4, 25.3, "MaoDeObra"),
  ins("D0104", "ARMADOR (COM ENCARGOS)", "H", 28.1, 25.0, "MaoDeObra"),
  ins("D0201", "CIMENTO PORTLAND COMPOSTO CP II-32", "KG", 0.82, 0.82, "Material"),
  ins("D0202", "AREIA MÉDIA - POSTO JAZIDA/FORNECEDOR", "M3", 120.0, 120.0, "Material"),
  ins("D0203", "PEDRA BRITADA N. 1 (9,5 a 19 MM)", "M3", 110.0, 110.0, "Material"),
  ins("D0204", "AÇO CA-50, 10,0 MM, VERGALHÃO", "KG", 7.9, 7.9, "Material"),
  ins("D0205", "ARAME RECOZIDO 18 BWG", "KG", 14.5, 14.5, "Material"),
  ins("D0206", "PREGO DE AÇO POLIDO COM CABEÇA 18 X 27", "KG", 18.2, 18.2, "Material"),
  ins("D0207", "TÁBUA DE PINUS 2,5 X 30 CM (1 X 12\")", "M", 9.8, 9.8, "Material"),
  ins("D0208", "BLOCO CERÂMICO DE VEDAÇÃO 9 X 19 X 19 CM", "UN", 1.05, 1.05, "Material"),
  ins("D0301", "BETONEIRA 400 L, MOTOR ELÉTRICO 2 CV - CHP", "CHP", 2.1, 2.1, "Equipamento"),
]

const composicoes: ComposicaoCPU[] = [
  comp("D9001", "CONCRETO FCK = 25 MPA, PREPARO MECÂNICO COM BETONEIRA 400 L", "M3",
    [["D0201", 350], ["D0202", 0.65], ["D0203", 0.75], ["D0101", 6.0], ["D0301", 0.8]]),
  comp("D9002", "ARMAÇÃO DE ESTRUTURAS COM AÇO CA-50 DE 10,0 MM - MONTAGEM", "KG",
    [["D0204", 1.1], ["D0205", 0.025], ["D0104", 0.09], ["D0101", 0.05]]),
  comp("D9003", "FABRICAÇÃO, MONTAGEM E DESMONTAGEM DE FÔRMA PARA FUNDAÇÃO EM TÁBUA", "M2",
    [["D0207", 2.5], ["D0206", 0.3], ["D0103", 1.2], ["D0101", 0.6]]),
  comp("D9005", "ARGAMASSA TRAÇO 1:4 (CIMENTO E AREIA), PREPARO MECÂNICO", "M3",
    [["D0201", 380], ["D0202", 1.1], ["D0101", 8.0], ["D0301", 0.6]]),
  comp("D9004", "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS 9X19X19 CM, E = 9 CM", "M2",
    [["D0208", 27], ["D0102", 0.9], ["D0101", 0.45]], [["D9005", 0.012]]),
  comp("D9006", "ESCAVAÇÃO MANUAL DE VALA COM PROFUNDIDADE ATÉ 1,5 M", "M3", [["D0101", 3.5]]),
]

export const BASE_DEMO: BaseReferencia = {
  base_id: DEMO_BASE_ID,
  insumos: Object.fromEntries(insumos.map((i) => [i.id, i])),
  composicoes: Object.fromEntries(composicoes.map((c) => [c.id, c])),
}

/** Simula o retorno do endpoint /api/ai-edital para a demonstração. */
export const EDITAL_DEMO: AiEditalResponse = {
  metadados: {
    orgaoLicitante: "PREFEITURA MUNICIPAL DE EXEMPLO",
    numeroEdital: "Concorrência Eletrônica nº 012/2026",
    objetoObra: "Construção de Unidade Básica de Saúde — Porte I (DEMONSTRAÇÃO)",
    municipioUf: "Anápolis/GO",
    prazoExecucaoMeses: 4,
    bdiReferenciaEdital: 24.18,
    regimeDesonerado: false,
    bancoSugerido: { orgao: "SINAPI", uf: "GO", mesAno: "2026-05" },
  },
  itensExtraidos: [
    { itemHierarquia: "1.1", codigoReferencia: "PR-001", fonte: "PROPRIA", descricao: "PLACA DE OBRA EM CHAPA DE AÇO GALVANIZADO", unidade: "M2", quantidade: 6, precoUnitarioEdital: 420.0, etapaSugerida: "Serviços Preliminares" },
    { itemHierarquia: "1.2", codigoReferencia: "D9006", fonte: "SINAPI", descricao: "ESCAVAÇÃO MANUAL DE VALA COM PROFUNDIDADE ATÉ 1,5 M", unidade: "M3", quantidade: 45, precoUnitarioEdital: 105.0, etapaSugerida: "Serviços Preliminares" },
    { itemHierarquia: "2.1", codigoReferencia: "D9003", fonte: "SINAPI", descricao: "FÔRMA PARA FUNDAÇÃO EM TÁBUA", unidade: "M2", quantidade: 60, precoUnitarioEdital: 110.0, etapaSugerida: "Fundações" },
    { itemHierarquia: "2.2", codigoReferencia: "D9002", fonte: "SINAPI", descricao: "ARMAÇÃO COM AÇO CA-50 DE 10,0 MM", unidade: "KG", quantidade: 1200, precoUnitarioEdital: 15.1, etapaSugerida: "Fundações" },
    { itemHierarquia: "2.3", codigoReferencia: "D9001", fonte: "SINAPI", descricao: "CONCRETO FCK = 25 MPA, PREPARO MECÂNICO", unidade: "M3", quantidade: 18, precoUnitarioEdital: 760.0, etapaSugerida: "Fundações" },
    { itemHierarquia: "3.1", codigoReferencia: "D9004", fonte: "SINAPI", descricao: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS 9X19X19 CM", unidade: "M2", quantidade: 320, precoUnitarioEdital: 95.0, etapaSugerida: "Alvenaria" },
    { itemHierarquia: "3.2", codigoReferencia: "D9999", fonte: "SINAPI", descricao: "ENCUNHAMENTO DE ALVENARIA COM ARGAMASSA EXPANSIVA", unidade: "M", quantidade: 140, precoUnitarioEdital: 45.0, etapaSugerida: "Alvenaria" },
  ],
  resumoExigenciasTecnicas: [
    "Atestado de capacidade técnico-operacional de construção de edificação pública com área mínima de 250 m².",
    "CAT do responsável técnico em execução de estrutura de concreto armado (parcela de maior relevância).",
    "Registro da empresa e do responsável técnico no CREA ou CAU.",
  ],
}

