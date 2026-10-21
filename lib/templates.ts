// lib/templates.ts
// Textos institucionais e Declarações Legais Obrigatórias para Licitações de Obras
// e Serviços de Engenharia sob o regime da Lei Federal nº 14.133/2021 e Acórdão nº 2.622/2013-TCU.

import type { ChaveDeclaracao } from "./proposta-comercial/schema"

export interface DeclaracaoLegalDef {
  chave: ChaveDeclaracao
  titulo: string
  fundamentoLegal: string
  texto: string
}

export const DECLARACOES_LEI_14133: DeclaracaoLegalDef[] = [
  {
    chave: "custos_inclusos",
    titulo: "Inclusão Integral de Custos, Encargos e BDI",
    fundamentoLegal: "Art. 63, § 1º da Lei Federal nº 14.133/2021",
    texto:
      "DECLARAMOS, sob as penas da lei e em estrita observância ao Art. 63, § 1º da Lei Federal nº 14.133/2021, que nossa proposta econômica compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega das propostas, bem como todos os custos diretos e indiretos, materiais, mão de obra, equipamentos, fretes, tributos, encargos sociais, trabalhistas, previdenciários, fiscais, comerciais e a taxa de Bonificações e Despesas Indiretas (BDI).",
  },
  {
    chave: "elaboracao_independente",
    titulo: "Elaboração Independente de Proposta",
    fundamentoLegal: "IN SEGES/ME e Lei Federal nº 14.133/2021",
    texto:
      "DECLARAMOS, sob as penas da lei, em especial o Art. 337-F do Código Penal Brasileiro, que a presente proposta foi elaborada de maneira absolutamente independente e que o seu conteúdo não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato deste certame licitatório, por qualquer meio ou por qualquer pessoa.",
  },
  {
    chave: "reserva_cargos_pcd",
    titulo: "Reserva de Cargos para PcD e Reabilitado da Previdência Social",
    fundamentoLegal: "Art. 63, inciso IV da Lei Federal nº 14.133/2021",
    texto:
      "DECLARAMOS, para os devidos fins do Art. 63, inciso IV da Lei Federal nº 14.133/2021, que cumprimos as exigências de reserva de cargos prevista em lei para pessoa com deficiência e para reabilitado da Previdência Social, bem como as regras de acessibilidade previstas na legislação aplicável.",
  },
  {
    chave: "conhecimento_local",
    titulo: "Pleno Conhecimento do Edital, Projetos e Condições Locais da Obra",
    fundamentoLegal: "Art. 63, §§ 2º e 3º da Lei Federal nº 14.133/2021",
    texto:
      "DECLARAMOS, nos termos do Art. 63, §§ 2º e 3º da Lei Federal nº 14.133/2021, que tomamos conhecimento de todas as informações, projetos básicos/executivos, memoriais descritivos, especificações técnicas e das condições locais para o cumprimento integral das obrigações objeto da presente licitação, assumindo total responsabilidade pela execução dos serviços de engenharia nos prazos e padrões exigidos.",
  },
  {
    chave: "nao_emprega_menor",
    titulo: "Proibição de Trabalho Noturno, Perigoso ou Insalubre a Menores",
    fundamentoLegal: "Art. 68, inciso VI da Lei 14.133/2021 c/c Art. 7º, XXXIII da CF/88",
    texto:
      "DECLARAMOS, em cumprimento ao disposto no inciso XXXIII do Art. 7º da Constituição Federal e no inciso VI do Art. 68 da Lei Federal nº 14.133/2021, que não empregamos menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não empregamos menor de 16 (dezesseis) anos, salvo na condição de aprendiz, a partir de 14 (quatorze) anos.",
  },
]
