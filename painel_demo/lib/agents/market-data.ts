import type { AssetClass } from "@/lib/types";

export interface SemesterResult {
  period: string;
  netIncomeBn: number;
  netMarginPercent: number;
  revenueBn: number;
}

export interface NewsFact {
  headline: string;
  source: string;
  sentiment: "positivo" | "neutro" | "negativo";
  daysAgo: number;
}

export interface MarketAsset {
  ticker: string;
  name: string;
  sector: string;
  assetClass: AssetClass;
  price: number;
  changePercent: number;
  dividendYield: number;
  priceEarnings: number | null;
  priceToBook: number | null;
  roe: number | null;
  netMargin: number | null;
  netDebtToEbitda: number | null;
  marketCapBn: number;
  volatility: number;
  governance: string;
  governanceNote: string;
  riskFlags: string[];
  news: NewsFact[];
  semesterResults: SemesterResult[];
}

export const MARKET_DATA: MarketAsset[] = [
  {
    ticker: "PETR4",
    name: "Petrobras PN",
    sector: "Petróleo e Gás",
    assetClass: "Ações",
    price: 38.52,
    changePercent: 0.84,
    dividendYield: 13.2,
    priceEarnings: 4.8,
    priceToBook: 1.05,
    roe: 22.4,
    netMargin: 18.5,
    netDebtToEbitda: 0.85,
    marketCapBn: 502.3,
    volatility: 28.4,
    governance: "Nível 2",
    governanceNote:
      "Estatal de capital misto com histórico de interferência política em preços de combustíveis; conselho reformulado com maioria independente.",
    riskFlags: [
      "Risco de interferência governamental na política de preços",
      "Exposição à volatilidade do Brent",
    ],
    news: [
      {
        headline:
          "Petrobras aprova dividendos extraordinários de R$ 20 bi após resultado do 1S",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 6,
      },
      {
        headline:
          "Plano estratégico mantém foco no pré-sal e disciplina de capital",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 14,
      },
      {
        headline:
          "Analistas alertam para pressão do governo por investimentos em refino",
        source: "Reuters Brasil",
        sentiment: "negativo",
        daysAgo: 21,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 42.8, netMarginPercent: 18.5, revenueBn: 231.4 },
      { period: "2S2024", netIncomeBn: 38.1, netMarginPercent: 16.9, revenueBn: 225.6 },
      { period: "1S2024", netIncomeBn: 36.5, netMarginPercent: 15.8, revenueBn: 230.9 },
    ],
  },
  {
    ticker: "VALE3",
    name: "Vale ON",
    sector: "Mineração",
    assetClass: "Ações",
    price: 61.84,
    changePercent: -0.52,
    dividendYield: 8.9,
    priceEarnings: 5.6,
    priceToBook: 1.25,
    roe: 20.1,
    netMargin: 24.2,
    netDebtToEbitda: 0.5,
    marketCapBn: 265.7,
    volatility: 26.1,
    governance: "Novo Mercado",
    governanceNote:
      "Capital pulverizado no Novo Mercado; provisões de Mariana/Brumadinho já majoritariamente equacionadas em acordo global.",
    riskFlags: [
      "Dependência da demanda chinesa por minério de ferro",
      "Passivos socioambientais residuais",
    ],
    news: [
      {
        headline:
          "Vale fecha acordo definitivo de reparação de Mariana e reduz incerteza jurídica",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 9,
      },
      {
        headline:
          "Preço do minério recua com dados fracos da construção civil na China",
        source: "Bloomberg Línea",
        sentiment: "negativo",
        daysAgo: 4,
      },
      {
        headline:
          "Divisão de metais para transição energética atrai interesse de sócios estratégicos",
        source: "Exame",
        sentiment: "positivo",
        daysAgo: 17,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 26.4, netMarginPercent: 24.2, revenueBn: 109.1 },
      { period: "2S2024", netIncomeBn: 24.9, netMarginPercent: 22.7, revenueBn: 109.7 },
      { period: "1S2024", netIncomeBn: 27.8, netMarginPercent: 25.1, revenueBn: 110.8 },
    ],
  },
  {
    ticker: "ITUB4",
    name: "Itaú Unibanco PN",
    sector: "Bancos",
    assetClass: "Ações",
    price: 34.21,
    changePercent: 0.31,
    dividendYield: 6.3,
    priceEarnings: 9.2,
    priceToBook: 1.75,
    roe: 21.5,
    netMargin: 24.0,
    netDebtToEbitda: null,
    marketCapBn: 335.2,
    volatility: 19.8,
    governance: "Nível 1",
    governanceNote:
      "Maior banco privado da América Latina; ROE consistentemente acima de 20% e índice de inadimplência controlado.",
    riskFlags: ["Compressão de spreads com queda da Selic"],
    news: [
      {
        headline:
          "Itaú eleva guidance de carteira de crédito e anuncia recompra de ações",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 8,
      },
      {
        headline:
          "Banco lidera ranking de rentabilidade entre grandes bancos pelo 12º trimestre seguido",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 15,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 21.6, netMarginPercent: 24.0, revenueBn: 90.0 },
      { period: "2S2024", netIncomeBn: 20.4, netMarginPercent: 23.1, revenueBn: 88.3 },
      { period: "1S2024", netIncomeBn: 19.1, netMarginPercent: 22.4, revenueBn: 85.3 },
    ],
  },
  {
    ticker: "BBAS3",
    name: "Banco do Brasil ON",
    sector: "Bancos",
    assetClass: "Ações",
    price: 27.93,
    changePercent: -1.12,
    dividendYield: 9.1,
    priceEarnings: 4.3,
    priceToBook: 0.78,
    roe: 18.9,
    netMargin: 17.2,
    netDebtToEbitda: null,
    marketCapBn: 159.4,
    volatility: 24.6,
    governance: "Novo Mercado",
    governanceNote:
      "Controle estatal com listagem no Novo Mercado; desconto de múltiplo histórico frente aos pares privados.",
    riskFlags: [
      "Inadimplência crescente na carteira do agronegócio",
      "Risco de uso político do banco em programas de crédito subsidiado",
    ],
    news: [
      {
        headline:
          "BB revisa provisões para safra e eleva PDD do agro em 18% no semestre",
        source: "Valor Econômico",
        sentiment: "negativo",
        daysAgo: 11,
      },
      {
        headline:
          "Payout de 45% é mantido e banco reforça compromisso com dividendos",
        source: "Money Times",
        sentiment: "positivo",
        daysAgo: 19,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 17.9, netMarginPercent: 17.2, revenueBn: 104.1 },
      { period: "2S2024", netIncomeBn: 18.8, netMarginPercent: 18.4, revenueBn: 102.2 },
      { period: "1S2024", netIncomeBn: 17.4, netMarginPercent: 17.9, revenueBn: 97.2 },
    ],
  },
  {
    ticker: "BBDC4",
    name: "Bradesco PN",
    sector: "Bancos",
    assetClass: "Ações",
    price: 14.82,
    changePercent: 0.12,
    dividendYield: 7.5,
    priceEarnings: 8.9,
    priceToBook: 0.88,
    roe: 11.2,
    netMargin: 12.4,
    netDebtToEbitda: null,
    marketCapBn: 157.1,
    volatility: 22.9,
    governance: "Nível 1",
    governanceNote:
      "Em plano plurianual de reestruturação; rentabilidade ainda abaixo do custo de capital, com recuperação gradual.",
    riskFlags: ["ROE abaixo do custo de capital", "Execução do turnaround em curso"],
    news: [
      {
        headline:
          "Bradesco acelera fechamento de agências e corte de custos supera meta",
        source: "Exame",
        sentiment: "positivo",
        daysAgo: 12,
      },
      {
        headline:
          "Inadimplência de pessoa física volta a cair pelo terceiro trimestre",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 23,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 10.2, netMarginPercent: 12.4, revenueBn: 82.3 },
      { period: "2S2024", netIncomeBn: 9.4, netMarginPercent: 11.6, revenueBn: 81.0 },
      { period: "1S2024", netIncomeBn: 8.1, netMarginPercent: 10.2, revenueBn: 79.4 },
    ],
  },
  {
    ticker: "BBSE3",
    name: "BB Seguridade ON",
    sector: "Seguros",
    assetClass: "Ações",
    price: 36.94,
    changePercent: 0.45,
    dividendYield: 9.4,
    priceEarnings: 8.6,
    priceToBook: 4.9,
    roe: 55.2,
    netMargin: 78.1,
    netDebtToEbitda: 0.0,
    marketCapBn: 73.8,
    volatility: 17.2,
    governance: "Novo Mercado",
    governanceNote:
      "Negócio assset-light de seguros e previdência distribuído pela rede do Banco do Brasil; caixa líquido e payout elevado.",
    riskFlags: [
      "Dependência do canal de distribuição do Banco do Brasil",
      "Sensibilidade do resultado financeiro à queda da Selic",
    ],
    news: [
      {
        headline:
          "BB Seguridade reporta prêmios recordes na Brasilseg e eleva payout",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 7,
      },
      {
        headline:
          "Renovação do acordo de distribuição com BB até 2033 remove principal risco da tese",
        source: "Money Times",
        sentiment: "positivo",
        daysAgo: 28,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 4.4, netMarginPercent: 78.1, revenueBn: 5.6 },
      { period: "2S2024", netIncomeBn: 4.1, netMarginPercent: 76.4, revenueBn: 5.4 },
      { period: "1S2024", netIncomeBn: 3.9, netMarginPercent: 75.2, revenueBn: 5.2 },
    ],
  },
  {
    ticker: "TAEE11",
    name: "Taesa UNT",
    sector: "Energia — Transmissão",
    assetClass: "Ações",
    price: 34.62,
    changePercent: -0.23,
    dividendYield: 9.8,
    priceEarnings: 9.5,
    priceToBook: 1.6,
    roe: 17.2,
    netMargin: 52.3,
    netDebtToEbitda: 3.4,
    marketCapBn: 11.9,
    volatility: 14.1,
    governance: "Nível 2",
    governanceNote:
      "Receita regulada (RAP) com contratos longos corrigidos por inflação; alavancagem elevada para financiar novos lotes de transmissão.",
    riskFlags: [
      "Dívida Líquida/EBITDA acima de 3x",
      "Revisões tarifárias periódicas da ANEEL",
    ],
    news: [
      {
        headline:
          "Taesa arremata lote no leilão de transmissão com deságio disciplinado",
        source: "Canal Energia",
        sentiment: "positivo",
        daysAgo: 10,
      },
      {
        headline:
          "Ciclo de reforços e melhorias amplia RAP contratada para 2026",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 26,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 0.62, netMarginPercent: 52.3, revenueBn: 1.19 },
      { period: "2S2024", netIncomeBn: 0.58, netMarginPercent: 50.9, revenueBn: 1.14 },
      { period: "1S2024", netIncomeBn: 0.55, netMarginPercent: 49.8, revenueBn: 1.1 },
    ],
  },
  {
    ticker: "TRPL4",
    name: "ISA Energia PN",
    sector: "Energia — Transmissão",
    assetClass: "Ações",
    price: 25.91,
    changePercent: 0.08,
    dividendYield: 7.1,
    priceEarnings: 7.2,
    priceToBook: 0.95,
    roe: 13.5,
    netMargin: 48.7,
    netDebtToEbitda: 2.1,
    marketCapBn: 17.1,
    volatility: 13.8,
    governance: "Nível 1",
    governanceNote:
      "Controlada pela colombiana ISA; portfólio maduro de transmissão com fluxo de caixa previsível e disciplina de capital.",
    riskFlags: ["Crescimento dependente de leilões competitivos"],
    news: [
      {
        headline:
          "ISA Energia conclui projeto de reforço em SP dentro do orçamento",
        source: "Canal Energia",
        sentiment: "positivo",
        daysAgo: 13,
      },
      {
        headline:
          "Companhia anuncia JCP complementar referente ao semestre",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 20,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 1.21, netMarginPercent: 48.7, revenueBn: 2.48 },
      { period: "2S2024", netIncomeBn: 1.14, netMarginPercent: 47.2, revenueBn: 2.42 },
      { period: "1S2024", netIncomeBn: 1.08, netMarginPercent: 46.5, revenueBn: 2.32 },
    ],
  },
  {
    ticker: "CMIG4",
    name: "Cemig PN",
    sector: "Energia — Integrada",
    assetClass: "Ações",
    price: 11.42,
    changePercent: 0.62,
    dividendYield: 8.7,
    priceEarnings: 5.9,
    priceToBook: 1.15,
    roe: 19.8,
    netMargin: 16.4,
    netDebtToEbitda: 1.0,
    marketCapBn: 32.6,
    volatility: 18.9,
    governance: "Nível 1",
    governanceNote:
      "Estatal mineira em ciclo de desalavancagem e desinvestimento de ativos não estratégicos; risco político estadual mitigado por estatuto.",
    riskFlags: [
      "Controle estatal (Governo de Minas Gerais)",
      "Discussões recorrentes sobre federalização/privatização",
    ],
    news: [
      {
        headline:
          "Cemig aprova plano de investimentos recorde em distribuição",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 16,
      },
      {
        headline:
          "Venda de participação na Aliança Energia reforça caixa da companhia",
        source: "Exame",
        sentiment: "positivo",
        daysAgo: 30,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 3.1, netMarginPercent: 16.4, revenueBn: 18.9 },
      { period: "2S2024", netIncomeBn: 2.9, netMarginPercent: 15.7, revenueBn: 18.5 },
      { period: "1S2024", netIncomeBn: 2.7, netMarginPercent: 15.1, revenueBn: 17.9 },
    ],
  },
  {
    ticker: "CPLE6",
    name: "Copel PNB",
    sector: "Energia — Integrada",
    assetClass: "Ações",
    price: 10.97,
    changePercent: 0.27,
    dividendYield: 6.4,
    priceEarnings: 8.8,
    priceToBook: 1.05,
    roe: 12.0,
    netMargin: 12.8,
    netDebtToEbitda: 1.9,
    marketCapBn: 32.4,
    volatility: 17.5,
    governance: "Novo Mercado",
    governanceNote:
      "Privatizada em 2023 e migrada ao Novo Mercado; em processo de captura de eficiências operacionais pós-privatização.",
    riskFlags: ["Execução da agenda de eficiência pós-privatização"],
    news: [
      {
        headline:
          "Copel entrega corte de PMSO acima do prometido no plano de eficiência",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 9,
      },
      {
        headline:
          "Companhia estuda rotação de ativos de geração eólica",
        source: "MegaWhat",
        sentiment: "neutro",
        daysAgo: 24,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 1.4, netMarginPercent: 12.8, revenueBn: 10.9 },
      { period: "2S2024", netIncomeBn: 1.3, netMarginPercent: 12.1, revenueBn: 10.7 },
      { period: "1S2024", netIncomeBn: 1.1, netMarginPercent: 10.9, revenueBn: 10.1 },
    ],
  },
  {
    ticker: "EGIE3",
    name: "Engie Brasil ON",
    sector: "Energia — Geração",
    assetClass: "Ações",
    price: 39.84,
    changePercent: -0.35,
    dividendYield: 7.9,
    priceEarnings: 10.2,
    priceToBook: 2.6,
    roe: 26.3,
    netMargin: 28.9,
    netDebtToEbitda: 2.8,
    marketCapBn: 32.5,
    volatility: 15.3,
    governance: "Novo Mercado",
    governanceNote:
      "Controlada pelo grupo francês Engie; portfólio 100% renovável com contratos longos e histórico de payout próximo a 100%.",
    riskFlags: [
      "Preços de energia de longo prazo pressionados",
      "Alavancagem em elevação por novos projetos de transmissão",
    ],
    news: [
      {
        headline:
          "Engie conclui sistema de transmissão Gralha Azul e reforça receita regulada",
        source: "Canal Energia",
        sentiment: "positivo",
        daysAgo: 18,
      },
      {
        headline:
          "Curva de preços de energia de longo prazo segue deprimida e limita repactuações",
        source: "MegaWhat",
        sentiment: "negativo",
        daysAgo: 8,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 1.9, netMarginPercent: 28.9, revenueBn: 6.6 },
      { period: "2S2024", netIncomeBn: 1.8, netMarginPercent: 27.8, revenueBn: 6.5 },
      { period: "1S2024", netIncomeBn: 1.7, netMarginPercent: 27.1, revenueBn: 6.3 },
    ],
  },
  {
    ticker: "VIVT3",
    name: "Vivo (Telefônica Brasil) ON",
    sector: "Telecomunicações",
    assetClass: "Ações",
    price: 54.33,
    changePercent: 0.18,
    dividendYield: 6.6,
    priceEarnings: 14.5,
    priceToBook: 1.45,
    roe: 10.1,
    netMargin: 10.8,
    netDebtToEbitda: 0.6,
    marketCapBn: 89.9,
    volatility: 12.7,
    governance: "Novo Mercado",
    governanceNote:
      "Líder em telefonia móvel pós-paga e fibra; geração de caixa robusta destinada a dividendos e redução de capital.",
    riskFlags: ["Setor maduro com crescimento de receita limitado"],
    news: [
      {
        headline:
          "Vivo anuncia nova redução de capital com devolução de R$ 5 bi aos acionistas",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 5,
      },
      {
        headline:
          "Base de fibra ótica cresce dois dígitos e sustenta receita fixa",
        source: "Teletime",
        sentiment: "positivo",
        daysAgo: 22,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 3.0, netMarginPercent: 10.8, revenueBn: 27.8 },
      { period: "2S2024", netIncomeBn: 2.9, netMarginPercent: 10.4, revenueBn: 27.9 },
      { period: "1S2024", netIncomeBn: 2.6, netMarginPercent: 9.7, revenueBn: 26.8 },
    ],
  },
  {
    ticker: "TIMS3",
    name: "TIM ON",
    sector: "Telecomunicações",
    assetClass: "Ações",
    price: 18.92,
    changePercent: -0.11,
    dividendYield: 6.1,
    priceEarnings: 12.8,
    priceToBook: 1.15,
    roe: 9.5,
    netMargin: 12.2,
    netDebtToEbitda: 0.3,
    marketCapBn: 45.8,
    volatility: 14.9,
    governance: "Novo Mercado",
    governanceNote:
      "Subsidiária da Telecom Italia com balanço desalavancado; remuneração ao acionista crescente via dividendos e JCP.",
    riskFlags: ["Competição agressiva no segmento pré-pago"],
    news: [
      {
        headline:
          "TIM eleva guidance de remuneração ao acionista para o triênio",
        source: "Teletime",
        sentiment: "positivo",
        daysAgo: 12,
      },
      {
        headline:
          "Receita de serviços móveis cresce acima da inflação pelo 8º trimestre",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 27,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 1.6, netMarginPercent: 12.2, revenueBn: 13.1 },
      { period: "2S2024", netIncomeBn: 1.5, netMarginPercent: 11.8, revenueBn: 12.9 },
      { period: "1S2024", netIncomeBn: 1.4, netMarginPercent: 11.2, revenueBn: 12.5 },
    ],
  },
  {
    ticker: "WEGE3",
    name: "WEG ON",
    sector: "Bens de Capital",
    assetClass: "Ações",
    price: 38.24,
    changePercent: 1.05,
    dividendYield: 1.6,
    priceEarnings: 26.5,
    priceToBook: 7.8,
    roe: 30.2,
    netMargin: 15.9,
    netDebtToEbitda: -0.4,
    marketCapBn: 160.5,
    volatility: 23.2,
    governance: "Novo Mercado",
    governanceNote:
      "Companhia de crescimento com retorno sobre capital investido de elite; múltiplos historicamente premium.",
    riskFlags: ["Valuation esticado para estratégias de renda"],
    news: [
      {
        headline:
          "WEG expande capacidade de transformadores nos EUA com nova planta",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 15,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 3.4, netMarginPercent: 15.9, revenueBn: 21.4 },
      { period: "2S2024", netIncomeBn: 3.1, netMarginPercent: 15.2, revenueBn: 20.4 },
      { period: "1S2024", netIncomeBn: 2.8, netMarginPercent: 14.8, revenueBn: 18.9 },
    ],
  },
  {
    ticker: "ABEV3",
    name: "Ambev ON",
    sector: "Bebidas",
    assetClass: "Ações",
    price: 13.61,
    changePercent: 0.22,
    dividendYield: 5.6,
    priceEarnings: 13.9,
    priceToBook: 2.1,
    roe: 16.2,
    netMargin: 17.4,
    netDebtToEbitda: -0.8,
    marketCapBn: 214.3,
    volatility: 16.8,
    governance: "Novo Mercado",
    governanceNote:
      "Caixa líquido bilionário e marcas dominantes; crescimento de volume estagnado no Brasil compensado por premiumização.",
    riskFlags: ["Volumes de cerveja estagnados", "Pressão tributária sobre bebidas"],
    news: [
      {
        headline:
          "Ambev anuncia dividendo extraordinário com excesso de caixa",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 11,
      },
      {
        headline:
          "Reforma tributária pode elevar carga sobre bebidas alcoólicas, avalia setor",
        source: "Valor Econômico",
        sentiment: "negativo",
        daysAgo: 19,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 7.4, netMarginPercent: 17.4, revenueBn: 42.5 },
      { period: "2S2024", netIncomeBn: 8.1, netMarginPercent: 18.2, revenueBn: 44.5 },
      { period: "1S2024", netIncomeBn: 7.0, netMarginPercent: 16.9, revenueBn: 41.4 },
    ],
  },
  {
    ticker: "ITSA4",
    name: "Itaúsa PN",
    sector: "Holding",
    assetClass: "Ações",
    price: 11.23,
    changePercent: 0.44,
    dividendYield: 8.2,
    priceEarnings: 6.9,
    priceToBook: 1.35,
    roe: 19.4,
    netMargin: 88.6,
    netDebtToEbitda: 0.2,
    marketCapBn: 118.2,
    volatility: 17.1,
    governance: "Nível 1",
    governanceNote:
      "Holding do Itaú com desconto histórico sobre o valor das participações; diversificação em Alpargatas, Dexco, CCR e NTS.",
    riskFlags: ["Desconto de holding persistente"],
    news: [
      {
        headline:
          "Itaúsa reduz desconto de holding após venda parcial de participação na XP",
        source: "Money Times",
        sentiment: "positivo",
        daysAgo: 14,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 7.8, netMarginPercent: 88.6, revenueBn: 8.8 },
      { period: "2S2024", netIncomeBn: 7.3, netMarginPercent: 87.1, revenueBn: 8.4 },
      { period: "1S2024", netIncomeBn: 6.9, netMarginPercent: 86.2, revenueBn: 8.0 },
    ],
  },
  {
    ticker: "CSMG3",
    name: "Copasa ON",
    sector: "Saneamento",
    assetClass: "Ações",
    price: 23.74,
    changePercent: -0.29,
    dividendYield: 7.4,
    priceEarnings: 5.8,
    priceToBook: 0.92,
    roe: 16.5,
    netMargin: 20.1,
    netDebtToEbitda: 1.6,
    marketCapBn: 9.0,
    volatility: 21.4,
    governance: "Novo Mercado",
    governanceNote:
      "Estatal mineira de saneamento; tese de privatização recorrente adiciona opcionalidade, mas depende de aprovação legislativa.",
    riskFlags: [
      "Controle estatal (Governo de Minas Gerais)",
      "Revisões tarifárias da agência reguladora",
    ],
    news: [
      {
        headline:
          "Governo de Minas retoma discussão sobre federalização e privatização da Copasa",
        source: "O Tempo",
        sentiment: "positivo",
        daysAgo: 6,
      },
      {
        headline:
          "Copasa anuncia dividendos extraordinários e payout de 50%",
        source: "Money Times",
        sentiment: "positivo",
        daysAgo: 25,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 0.78, netMarginPercent: 20.1, revenueBn: 3.88 },
      { period: "2S2024", netIncomeBn: 0.72, netMarginPercent: 19.2, revenueBn: 3.75 },
      { period: "1S2024", netIncomeBn: 0.69, netMarginPercent: 18.8, revenueBn: 3.67 },
    ],
  },
  {
    ticker: "SAPR11",
    name: "Sanepar UNT",
    sector: "Saneamento",
    assetClass: "Ações",
    price: 27.64,
    changePercent: 0.15,
    dividendYield: 5.8,
    priceEarnings: 7.1,
    priceToBook: 1.08,
    roe: 15.8,
    netMargin: 22.4,
    netDebtToEbitda: 1.2,
    marketCapBn: 8.3,
    volatility: 19.6,
    governance: "Nível 2",
    governanceNote:
      "Estatal paranaense com tarifa em processo de reequilíbrio regulatório; balanço saudável e múltiplo descontado.",
    riskFlags: ["Interferência tarifária do governo estadual"],
    news: [
      {
        headline:
          "Agepar homologa reajuste tarifário integral para o ciclo 2025-2026",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 16,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 0.81, netMarginPercent: 22.4, revenueBn: 3.62 },
      { period: "2S2024", netIncomeBn: 0.76, netMarginPercent: 21.5, revenueBn: 3.53 },
      { period: "1S2024", netIncomeBn: 0.7, netMarginPercent: 20.6, revenueBn: 3.4 },
    ],
  },
  {
    ticker: "CXSE3",
    name: "Caixa Seguridade ON",
    sector: "Seguros",
    assetClass: "Ações",
    price: 15.23,
    changePercent: 0.53,
    dividendYield: 8.8,
    priceEarnings: 9.5,
    priceToBook: 4.2,
    roe: 45.1,
    netMargin: 74.3,
    netDebtToEbitda: 0.0,
    marketCapBn: 45.7,
    volatility: 16.4,
    governance: "Novo Mercado",
    governanceNote:
      "Braço de seguros da Caixa Econômica Federal; ROE elevado e payout de ~90%, com dependência do canal bancário estatal.",
    riskFlags: [
      "Dependência do canal de distribuição da Caixa",
      "Controle estatal indireto",
    ],
    news: [
      {
        headline:
          "Caixa Seguridade bate recorde de prêmios em habitacional e prestamista",
        source: "Valor Econômico",
        sentiment: "positivo",
        daysAgo: 9,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 2.1, netMarginPercent: 74.3, revenueBn: 2.83 },
      { period: "2S2024", netIncomeBn: 1.95, netMarginPercent: 72.8, revenueBn: 2.68 },
      { period: "1S2024", netIncomeBn: 1.8, netMarginPercent: 71.5, revenueBn: 2.52 },
    ],
  },
  {
    ticker: "KLBN11",
    name: "Klabin UNT",
    sector: "Papel e Celulose",
    assetClass: "Ações",
    price: 21.43,
    changePercent: -0.68,
    dividendYield: 4.9,
    priceEarnings: 9.8,
    priceToBook: 2.4,
    roe: 24.6,
    netMargin: 14.2,
    netDebtToEbitda: 3.9,
    marketCapBn: 25.9,
    volatility: 25.7,
    governance: "Nível 2",
    governanceNote:
      "Ciclo de capex do Projeto Plateau pressiona alavancagem; exposição cambial relevante na receita de celulose.",
    riskFlags: [
      "Dívida Líquida/EBITDA próxima de 4x",
      "Ciclicidade do preço da celulose",
    ],
    news: [
      {
        headline:
          "Klabin conclui ramp-up da MP28 e projeta desalavancagem a partir de 2026",
        source: "Valor Econômico",
        sentiment: "neutro",
        daysAgo: 13,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 1.4, netMarginPercent: 14.2, revenueBn: 9.9 },
      { period: "2S2024", netIncomeBn: 1.6, netMarginPercent: 15.8, revenueBn: 10.1 },
      { period: "1S2024", netIncomeBn: 1.2, netMarginPercent: 12.9, revenueBn: 9.3 },
    ],
  },
  {
    ticker: "EMBR3",
    name: "Embraer ON",
    sector: "Aeroespacial",
    assetClass: "Ações",
    price: 64.12,
    changePercent: 1.87,
    dividendYield: 0.8,
    priceEarnings: 22.4,
    priceToBook: 3.1,
    roe: 14.8,
    netMargin: 7.2,
    netDebtToEbitda: 0.9,
    marketCapBn: 47.1,
    volatility: 34.8,
    governance: "Novo Mercado",
    governanceNote:
      "Backlog recorde impulsionado por E2 e defesa; tese de crescimento, não de renda — dividendos residuais.",
    riskFlags: ["DY baixo para estratégias de renda", "Ciclicidade da aviação"],
    news: [
      {
        headline:
          "Embraer anuncia pedido firme de 60 jatos E195-E2 e backlog bate recorde",
        source: "Reuters Brasil",
        sentiment: "positivo",
        daysAgo: 4,
      },
    ],
    semesterResults: [
      { period: "1S2025", netIncomeBn: 1.1, netMarginPercent: 7.2, revenueBn: 15.3 },
      { period: "2S2024", netIncomeBn: 1.3, netMarginPercent: 8.1, revenueBn: 16.0 },
      { period: "1S2024", netIncomeBn: 0.7, netMarginPercent: 5.4, revenueBn: 13.0 },
    ],
  },
  {
    ticker: "HGLG11",
    name: "CSHG Logística FII",
    sector: "FII — Logística",
    assetClass: "FIIs",
    price: 158.02,
    changePercent: 0.21,
    dividendYield: 8.6,
    priceEarnings: null,
    priceToBook: 0.97,
    roe: null,
    netMargin: null,
    netDebtToEbitda: null,
    marketCapBn: 5.2,
    volatility: 9.8,
    governance: "FII — ANBIMA",
    governanceNote:
      "Fundo de galpões logísticos AAA com vacância historicamente baixa e contratos atípicos.",
    riskFlags: ["Sensibilidade à curva de juros longa"],
    news: [
      {
        headline:
          "HGLG11 anuncia aquisição de galpão last-mile em Cajamar com cap rate de 9,1%",
        source: "Clube FII",
        sentiment: "positivo",
        daysAgo: 8,
      },
    ],
    semesterResults: [],
  },
  {
    ticker: "MXRF11",
    name: "Maxi Renda FII",
    sector: "FII — Papel",
    assetClass: "FIIs",
    price: 9.46,
    changePercent: 0.11,
    dividendYield: 12.1,
    priceEarnings: null,
    priceToBook: 1.01,
    roe: null,
    netMargin: null,
    netDebtToEbitda: null,
    marketCapBn: 3.4,
    volatility: 7.2,
    governance: "FII — ANBIMA",
    governanceNote:
      "Fundo de CRIs pulverizado, maior base de cotistas da B3; carrego elevado atrelado a CDI e IPCA.",
    riskFlags: ["Risco de crédito dos CRIs em cenário de inadimplência"],
    news: [
      {
        headline:
          "MXRF11 mantém dividendo mensal e comunica carteira com 98% de adimplência",
        source: "Clube FII",
        sentiment: "positivo",
        daysAgo: 10,
      },
    ],
    semesterResults: [],
  },
  {
    ticker: "KNRI11",
    name: "Kinea Renda Imobiliária FII",
    sector: "FII — Híbrido",
    assetClass: "FIIs",
    price: 144.25,
    changePercent: -0.14,
    dividendYield: 8.9,
    priceEarnings: null,
    priceToBook: 0.89,
    roe: null,
    netMargin: null,
    netDebtToEbitda: null,
    marketCapBn: 3.9,
    volatility: 8.9,
    governance: "FII — ANBIMA",
    governanceNote:
      "Portfólio híbrido de lajes corporativas e galpões; gestão Kinea com desconto sobre valor patrimonial.",
    riskFlags: ["Vacância em lajes corporativas fora do eixo premium"],
    news: [
      {
        headline:
          "KNRI11 reduz vacância física para 6% após novas locações na Faria Lima",
        source: "InfoMoney",
        sentiment: "positivo",
        daysAgo: 12,
      },
    ],
    semesterResults: [],
  },
  {
    ticker: "XPML11",
    name: "XP Malls FII",
    sector: "FII — Shoppings",
    assetClass: "FIIs",
    price: 103.54,
    changePercent: 0.33,
    dividendYield: 10.2,
    priceEarnings: null,
    priceToBook: 0.92,
    roe: null,
    netMargin: null,
    netDebtToEbitda: null,
    marketCapBn: 6.1,
    volatility: 10.4,
    governance: "FII — ANBIMA",
    governanceNote:
      "Portfólio de shoppings dominantes; vendas nas mesmas lojas crescendo acima da inflação.",
    riskFlags: ["Sensibilidade do consumo discricionário a juros altos"],
    news: [
      {
        headline:
          "XPML11 reporta NOI recorde no trimestre com vendas +9% a/a",
        source: "Clube FII",
        sentiment: "positivo",
        daysAgo: 7,
      },
    ],
    semesterResults: [],
  },
  {
    ticker: "BOVA11",
    name: "iShares Ibovespa ETF",
    sector: "ETF — Índice",
    assetClass: "ETFs",
    price: 128.44,
    changePercent: 0.41,
    dividendYield: 0,
    priceEarnings: null,
    priceToBook: null,
    roe: null,
    netMargin: null,
    netDebtToEbitda: null,
    marketCapBn: 18.2,
    volatility: 18.3,
    governance: "ETF — B3",
    governanceNote: "ETF que replica o Ibovespa; instrumento de beta de mercado.",
    riskFlags: [],
    news: [],
    semesterResults: [],
  },
  {
    ticker: "IVVB11",
    name: "iShares S&P 500 ETF BRL",
    sector: "ETF — Internacional",
    assetClass: "ETFs",
    price: 340.18,
    changePercent: 0.76,
    dividendYield: 0,
    priceEarnings: null,
    priceToBook: null,
    roe: null,
    netMargin: null,
    netDebtToEbitda: null,
    marketCapBn: 12.6,
    volatility: 16.9,
    governance: "ETF — B3",
    governanceNote:
      "Exposição ao S&P 500 com hedge cambial implícito no preço em reais.",
    riskFlags: [],
    news: [],
    semesterResults: [],
  },
  {
    ticker: "AAPL34",
    name: "Apple BDR",
    sector: "BDR — Tecnologia",
    assetClass: "BDRs",
    price: 62.14,
    changePercent: 0.92,
    dividendYield: 0.5,
    priceEarnings: 32.1,
    priceToBook: 48.6,
    roe: 147.2,
    netMargin: 25.3,
    netDebtToEbitda: 0.4,
    marketCapBn: 17800,
    volatility: 22.4,
    governance: "BDR Nível 1",
    governanceNote: "Recibo de ações da Apple Inc. negociado na B3.",
    riskFlags: ["Exposição cambial USD/BRL"],
    news: [],
    semesterResults: [],
  },
];

export const MARKET_INDEX: ReadonlyMap<string, MarketAsset> = new Map(
  MARKET_DATA.map((asset) => [asset.ticker, asset])
);

export function findMarketAsset(ticker: string): MarketAsset | undefined {
  return MARKET_INDEX.get(ticker.toUpperCase().trim());
}

export function inferAssetClass(ticker: string): AssetClass {
  const known = findMarketAsset(ticker);
  if (known) return known.assetClass;
  const normalized = ticker.toUpperCase().trim();
  if (/^[A-Z]{4}11$/.test(normalized)) return "FIIs";
  if (/^[A-Z]{4}3[0-9]$/.test(normalized)) return "BDRs";
  if (/^(LFT|LTN|NTN|CDB|LCI|LCA|TESOURO|SELIC|IPCA)/.test(normalized)) return "Renda Fixa";
  if (/^[A-Z]{4}(3|4|5|6)$/.test(normalized)) return "Ações";
  return "Ações";
}
