// lib/templates.ts
import { ProjectType } from "./proposal-types"

// Correção: Tipagem explícita para os templates
export interface TemplateDef {
  nomeProjeto: string
  introServico: string
  tecnica: string
  cronDias: string[]
  observacoes: string[]
  condicoes: {
    pagamento: string
    prazo: string
    validade: string
  }
}

export const TEMPLATES: Record<ProjectType, TemplateDef> = {
  drenagem: {
    nomeProjeto: "DESENVOLVIMENTO DE PROJETO DE DRENAGEM DO SUBSOLO",
    introServico: "projeto de drenagem provisório e definitiva",
    tecnica: `Primeiramente será feita a avaliação do mapa Pedológico da área e do mapa geológico, com o objetivo de melhorar e identificar os tipos de solos e rochas da área de estudo.
            Para a técnica em questão serão utilizados furos a trado com diâmetro de 150 mm (Ver Fotos 1 a 6), uso de água potável, cronômetro digital, trena metálica e medidor de nível da água para determinação das infiltrações (sugeridos pela NBR 13969:1997). 
             O processo de escavação e saturação se dá em uma etapa até atingir as cotas necessárias para a realização dos ensaios, para todos os furos.`,
    cronDias: ["1", "2", "3", "4", "5", "6", "7 a 40"],
    observacoes: [
      "Visitas técnicas adicionais deverão ser marcadas com antecedência mínima de 7 dias e serão aditivadas ao valor desta proposta;",
      "As revisões que não estejam de acordo com a concepção do estudo original do projeto, serão aditivadas aos valores desta proposta."
    ],
    condicoes: {
      pagamento: "50% no aceite + 50% na entrega.",
      prazo: "40 Dias após a entrega de todos os arquivos necessários.",
      validade: "10 Dias."
    }
  },
  geotecnico: {
    nomeProjeto: "EXECUÇÃO DE ENSAIOS GEOTÉCNICOS EM SOLOS MOLES",
    introServico: "execução de ensaios geotécnicos em solos moles",
    tecnica: `De acordo com os procedimentos a serem adotados nas ocorrências de solos moles presentes em obras viárias, o DNIT apresenta as seguintes classes de aterros:
    
A. CLASSE I
    Enquadram-se nesta classe os aterros junto a estruturas rígidas, tal como os encontros de pontes e viadutos e demais interseções, bem como aterros próximos a estruturas sensíveis como oleodutos. A extensão do aterro classe I deve ser pelo menos 50 m para cada lado da interseção;

B. CLASSE II
    São os aterros que não estão próximos a estruturas sensíveis, porem são altos, definindo-se como altos os que têm alturas maiores que 3,0 m;

C. CLASSE III
    Os aterros Classe III são baixos, isto é, com alturas menores que 3,0 m e afastados de estruturas sensíveis. 
    De uma forma geral, segundo os procedimentos adotados pelo DNIT, as classes de aterro (Classe I, II e III) e as fases (Fase de estudo de viabilidade, fase de projeto básico e Fase de projeto executivo) definem as quantidades e qualidades das investigações geotécnicas nas ocorrências de solos moles. 
    Tais investigações servem para caracterizar os depósitos de solos moles, identificando as extensões, espessuras e propriedades geotécnicas.
    Primeiramente será feito a avaliação do mapa pedológicos (Figura 01) e do mapa geológico (Figura 02), com o objetivo de melhorar e identificar os tipos de solos e rochas da área de estudo.`,
    cronDias: ["1 a 5", "6 a 10", "11 a 15", "16 a 20", "21 a 25"],
    observacoes: [
      "O fornecimento de água acessível ao local de trabalho;",
      "Abertura do pré-furo/cava;",
      "Remover qualquer obstáculo, aparente ou não, que impeça a escavação;",
      "Localizar, remover e verificar eventuais interferências com redes enterradas e elevadas, das concessionárias públicas ou privadas (ex: redes de águas, esgoto, energia, telefonia, etc.) caso haja necessidade;",
      "A CONTRATANTE deve se certificar que a área em estudo terá livre acesso para a CONTRATADA;",
      "Nos valores descritos, não estão inclusos serviços extras referentes à Medicina e Segurança do Trabalho (exames médicos complementares ASO, PCMSO / PPRA, treinamentos em NRs específicas e demais documentação pertinente que venha ser solicitada). Sendo exigência da CONTRATANTE, os valores referentes aos documentos solicitados serão cobrados extraordinariamente, conforme carta de medição emitida pela CONTRATADA."
    ],
    condicoes: {
      pagamento: "50% do valor global no aceite desta proposta + 50% na entrega do produto final.",
      prazo: "até 25 dias trabalháveis após o início dos serviços.",
      validade: "20 Dias."
    }
  },
  sondagem: {
    nomeProjeto: "EXECUÇÃO DE SONDAGEM",
    introServico: "execução de sondagens",
    tecnica: "",
    cronDias: ["1", "2", "3", "4", "5"],
    observacoes: [
      "Água por conta do contratante;",
      "Remover qualquer obstáculo, aparente ou não, que impeça a escavação;",
      "Localizar, remover e verificar eventuais interferências com redes enterradas e elevadas, das concessionárias públicas ou privadas (ex: redes de águas, esgoto, energia, telefonia, etc.) caso haja necessidade;",
      "A CONTRATANTE deve se certificar que a área em estudo terá livre acesso para a CONTRATADA; ",
      "Nos valores descritos, não estão inclusos serviços extras referentes à Medicina e Segurança do Trabalho (exames médicos complementares ASO, PCMSO / PPRA, treinamentos em NRs específicas e demais documentação pertinente que venha ser solicitada). Sendo exigência da CONTRATANTE, os valores referentes aos documentos solicitados serão cobrados extraordinariamente, conforme carta de medição emitida pela CONTRATADA."
    ],
    // Correção: Removida a redundância "trabalháveis" do prazo
    condicoes: { pagamento: "100% após a entrega dos serviços realizados.", prazo: "20 Dias úteis.", validade: "15 Dias." }
  }
}

export const GEO_IMAGES = [
  "/img/placeholder_fig3.jpg",
  "/img/placeholder_fig4.jpg",
  "/img/placeholder_fig5.jpg",
  "/img/placeholder_fig6.jpg",
  "/img/placeholder_fig7.jpg",
]