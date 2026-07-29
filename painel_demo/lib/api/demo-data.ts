/**
 * MODO DEMONSTRAÇÃO (`NEXT_PUBLIC_IIOS_DEMO=1`) — fixtures congeladas para
 * deploys de prévia SEM backend (ex.: Vercel). Regra não negociável nº 1 do
 * CLAUDE.md: nenhum dado simulado exibido como real — TODO campo de fonte
 * aqui é rotulado "DEMONSTRAÇÃO" e a UI exibe banner + selo em toda tela.
 *
 * Os valores têm ordem de grandeza plausível, mas são ILUSTRATIVOS e
 * estáticos: não provêm de CVM/B3/Tesouro/BCB e não devem ser usados para
 * qualquer decisão. Mutações (importar, confirmar IPS, avaliar perfil)
 * são desabilitadas com erro explícito instruindo a rodar o backend real.
 */

import {
  IIOSApiError,
  type AtivoB3,
  type AtivosPage,
  type AtivoDetalhe,
  type ChatFerramentas,
  type ChatResposta,
  type ConfirmedPolicy,
  type LatestAssessment,
  type MacroRegimes,
  type MacroSerie,
  type Overview,
  type PolicyVersion,
  type PortfolioIssue,
  type RebalancePlan,
  type SeriePonto,
  type SnapshotAnalysis,
  type SnapshotDetail,
  type SnapshotSummary,
  type TesouroCenarios,
  type TesouroPainel,
  type TesouroTitulo,
} from "./investment-os";

const FONTE_DEMO =
  "DEMONSTRAÇÃO — fixture ilustrativa do frontend; NÃO é dado oficial (CVM/B3/Tesouro/BCB)";

const DATA_BASE_DEMO = "2026-07-24";
const GERADO_EM_DEMO = "2026-07-24T21:00:00-03:00";

/** Latência artificial para os estados de carregamento aparecerem. */
const DEMO_LATENCY_MS = 350;

function demoBlockedAction(): never {
  throw new IIOSApiError(
    503,
    "demo_mode",
    "Modo demonstração: esta ação exige o backend real. Rode `uvicorn " +
      "investment_os.api.main:app` no repositório Celest.ia-v2-Alpha e " +
      "aponte NEXT_PUBLIC_IIOS_API_URL para ele."
  );
}

// ---------------------------------------------------------------------------
// Séries macro (BCB seria a fonte real; aqui, pontos ilustrativos)
// ---------------------------------------------------------------------------

function serie(pontos: Array<[string, number]>): SeriePonto[] {
  return pontos.map(([data, valor]) => ({ data, valor }));
}

const SERIES_DEMO: Record<string, SeriePonto[]> = {
  selic_meta: serie([
    ["2026-02-24", 14.25],
    ["2026-03-19", 14.25],
    ["2026-05-07", 13.75],
    ["2026-06-18", 13.25],
    ["2026-07-24", 13.25],
  ]),
  ipca_mensal: serie([
    ["2026-02-28", 0.61],
    ["2026-03-31", 0.42],
    ["2026-04-30", 0.38],
    ["2026-05-31", 0.31],
    ["2026-06-30", 0.24],
  ]),
  ptax_venda: serie([
    ["2026-07-20", 5.41],
    ["2026-07-21", 5.44],
    ["2026-07-22", 5.39],
    ["2026-07-23", 5.42],
    ["2026-07-24", 5.45],
  ]),
  divida_bruta_pib: serie([
    ["2026-02-28", 78.9],
    ["2026-03-31", 79.2],
    ["2026-04-30", 79.6],
    ["2026-05-31", 79.8],
    ["2026-06-30", 80.1],
  ]),
};

const MACRO_REGIMES_DEMO: MacroRegimes = {
  data_geracao: GERADO_EM_DEMO,
  regimes: [
    {
      dimensao: "juros",
      estado: "restritivo em queda",
      detalhe:
        "Meta Selic em 13,25% a.a. após dois cortes de 50 bps (ilustrativo).",
      confianca: "ALTA",
      data_base: "2026-06-18",
      fonte: FONTE_DEMO,
      natureza: "DEMONSTRAÇÃO · OBSERVADO",
    },
    {
      dimensao: "inflacao",
      estado: "em desaceleração",
      detalhe:
        "IPCA mensal em queda para 0,24% a.m.; 12 meses ~4,6% (ilustrativo).",
      confianca: "MEDIA",
      data_base: "2026-06-30",
      fonte: FONTE_DEMO,
      natureza: "DEMONSTRAÇÃO · OBSERVADO",
    },
    {
      dimensao: "inflacao_expectativa",
      estado: "ancoragem parcial",
      detalhe:
        "Mediana Focus para o IPCA 2027 em 4,0% (ilustrativo).",
      confianca: "MEDIA",
      data_base: "2026-07-18",
      fonte: FONTE_DEMO,
      natureza: "DEMONSTRAÇÃO · EXPECTATIVA DE MERCADO (Focus)",
    },
    {
      dimensao: "cambio",
      estado: "estável",
      detalhe: "PTAX venda oscilando na faixa de R$ 5,39–5,45 (ilustrativo).",
      confianca: "MEDIA",
      data_base: DATA_BASE_DEMO,
      fonte: FONTE_DEMO,
      natureza: "DEMONSTRAÇÃO · OBSERVADO",
    },
    {
      dimensao: "fiscal",
      estado: "em deterioração gradual",
      detalhe:
        "Dívida bruta/PIB em alta lenta, ~80,1% do PIB (ilustrativo).",
      confianca: "BAIXA",
      data_base: "2026-06-30",
      fonte: FONTE_DEMO,
      natureza: "DEMONSTRAÇÃO · OBSERVADO",
    },
  ],
  series_recentes: SERIES_DEMO,
  premissas: [
    "MODO DEMONSTRAÇÃO: todos os pontos são ilustrativos e congelados.",
    "No sistema real, séries vêm do SGS/BCB e expectativas do Focus/Olinda.",
    "Expectativas (Focus) nunca são tratadas como dado observado.",
  ],
  fontes: {
    selic_meta: FONTE_DEMO,
    ipca_mensal: FONTE_DEMO,
    ptax_venda: FONTE_DEMO,
    divida_bruta_pib: FONTE_DEMO,
  },
  fora_do_escopo_desta_fase: [
    "Atividade (PIB mensal) e crédito não entram nesta demonstração.",
  ],
};

// ---------------------------------------------------------------------------
// Tesouro Direto (títulos, curvas, radar, cenários) — ilustrativo
// ---------------------------------------------------------------------------

function tituloModelado(
  tipo: string,
  vencimento: string,
  taxa: number,
  termo: "real" | "nominal",
  duration: number,
  percentil: number
): TesouroTitulo {
  return {
    tipo,
    vencimento,
    data_base: DATA_BASE_DEMO,
    taxa_compra_pct: taxa,
    taxa_venda_pct: taxa + 0.1,
    pu_compra: termo === "real" ? 1180.45 : 780.12,
    pu_venda: termo === "real" ? 1176.2 : 777.5,
    fonte: FONTE_DEMO,
    modelado: true,
    termo,
    duration_macaulay_anos: duration,
    modified_duration_anos: duration / (1 + taxa / 100),
    dv01_brl: 0.85,
    convexidade: duration * duration * 1.15,
    historico: {
      pregoes: 620,
      primeiro: "2024-01-02",
      percentil_taxa_atual: percentil,
      maxima: taxa + 1.1,
      minima: taxa - 2.0,
      media: taxa - 0.6,
      mediana: taxa - 0.7,
    },
  };
}

function tituloNaoModelado(
  tipo: string,
  vencimento: string,
  taxa: number,
  motivo: string
): TesouroTitulo {
  return {
    tipo,
    vencimento,
    data_base: DATA_BASE_DEMO,
    taxa_compra_pct: taxa,
    taxa_venda_pct: null,
    pu_compra: null,
    pu_venda: null,
    fonte: FONTE_DEMO,
    modelado: false,
    motivo_nao_modelado: motivo,
  };
}

const MOTIVO_POS_FIXADO =
  "Título pós-fixado: MTM por choque paralelo de taxa não se aplica " +
  "diretamente (demonstração).";

const TESOURO_PAINEL_DEMO: TesouroPainel = {
  data_base: DATA_BASE_DEMO,
  fonte: FONTE_DEMO,
  titulos: [
    tituloModelado("Tesouro Prefixado", "2029-01-01", 12.9, "nominal", 2.3, 38),
    tituloModelado("Tesouro Prefixado", "2032-01-01", 12.4, "nominal", 4.6, 42),
    tituloModelado(
      "Tesouro Prefixado com Juros Semestrais",
      "2035-01-01",
      12.1,
      "nominal",
      5.9,
      45
    ),
    tituloModelado("Tesouro IPCA+", "2035-05-15", 6.4, "real", 7.2, 74),
    tituloModelado("Tesouro IPCA+", "2040-08-15", 6.6, "real", 10.8, 79),
    tituloModelado("Tesouro IPCA+", "2045-05-15", 6.7, "real", 13.5, 81),
    tituloModelado("Tesouro IPCA+", "2050-08-15", 6.85, "real", 16.2, 88),
    tituloModelado(
      "Tesouro IPCA+ com Juros Semestrais",
      "2055-05-15",
      6.75,
      "real",
      12.4,
      83
    ),
    tituloNaoModelado("Tesouro Selic", "2029-03-01", 0.05, MOTIVO_POS_FIXADO),
    tituloNaoModelado("Tesouro Selic", "2031-03-01", 0.09, MOTIVO_POS_FIXADO),
    tituloNaoModelado(
      "Tesouro RendA+",
      "2045-01-15",
      6.5,
      "Fluxo de conversão em renda: modelagem específica fora desta demonstração."
    ),
    tituloNaoModelado(
      "Tesouro Educa+",
      "2036-08-15",
      6.3,
      "Fluxo de pagamentos educacional: modelagem específica fora desta demonstração."
    ),
  ],
  curvas: {
    nominal_prefixado: [
      { vencimento: "2029-01-01", taxa_pct: 12.9, tipo: "Tesouro Prefixado" },
      { vencimento: "2032-01-01", taxa_pct: 12.4, tipo: "Tesouro Prefixado" },
      {
        vencimento: "2035-01-01",
        taxa_pct: 12.1,
        tipo: "Tesouro Prefixado com Juros Semestrais",
      },
    ],
    real_ipca: [
      { vencimento: "2035-05-15", taxa_pct: 6.4, tipo: "Tesouro IPCA+" },
      { vencimento: "2040-08-15", taxa_pct: 6.6, tipo: "Tesouro IPCA+" },
      { vencimento: "2045-05-15", taxa_pct: 6.7, tipo: "Tesouro IPCA+" },
      { vencimento: "2050-08-15", taxa_pct: 6.85, tipo: "Tesouro IPCA+" },
    ],
    nota:
      "DEMONSTRAÇÃO: curva do TD varejo ilustrativa — NÃO é curva ANBIMA " +
      "nem dado oficial.",
  },
  radar_janelas: [
    {
      tipo: "Tesouro IPCA+",
      vencimento: "2050-08-15",
      taxa_atual_pct: 6.85,
      percentil: 88,
      criterio: "taxa atual ≥ percentil 80 do histórico (demonstração)",
      saida_hysteresis_pct: 6.35,
      invalidacao:
        "Sai do radar se a taxa cair abaixo de 6,35% (hysteresis) — ilustrativo.",
      nota: "DEMONSTRAÇÃO — janela ilustrativa, não é recomendação.",
      confianca: "MEDIA",
    },
    {
      tipo: "Tesouro IPCA+",
      vencimento: "2045-05-15",
      taxa_atual_pct: 6.7,
      percentil: 81,
      criterio: "taxa atual ≥ percentil 80 do histórico (demonstração)",
      saida_hysteresis_pct: 6.25,
      invalidacao:
        "Sai do radar se a taxa cair abaixo de 6,25% (hysteresis) — ilustrativo.",
      nota: "DEMONSTRAÇÃO — janela ilustrativa, não é recomendação.",
      confianca: "MEDIA",
    },
  ],
  parametros_radar: {
    percentil_entrada: 80,
    percentil_saida_hysteresis: 70,
    min_pregoes: 252,
  },
  historico_oficial_desde: "2024-01-02",
};

function cenariosDemo(tipo: string, vencimento: string): TesouroCenarios {
  const titulo = TESOURO_PAINEL_DEMO.titulos.find(
    (t) => t.tipo === tipo && t.vencimento === vencimento && t.modelado
  );
  if (!titulo || titulo.duration_macaulay_anos === undefined) {
    throw new IIOSApiError(
      404,
      "titulo_nao_modelado",
      "Modo demonstração: cenários disponíveis apenas para títulos modelados."
    );
  }
  const taxa = titulo.taxa_compra_pct;
  const md = titulo.modified_duration_anos ?? 0;
  const choques = [-200, -100, -50, 50, 100, 200];
  return {
    tipo,
    vencimento,
    data_base: DATA_BASE_DEMO,
    taxa_atual_pct: taxa,
    risco: {
      duration_macaulay_anos: titulo.duration_macaulay_anos,
      modified_duration_anos: md,
      dv01_brl: titulo.dv01_brl ?? 0,
      convexidade: titulo.convexidade ?? 0,
    },
    cenarios_mtm: choques.map((bps) => {
      const variacao = -md * (bps / 100) + 0.5 * ((titulo.convexidade ?? 0) / 100) * (bps / 100) ** 2 * 0.01;
      return {
        choque_bps: bps,
        taxa_pct: taxa + bps / 100,
        pu_novo: Number(((titulo.pu_compra ?? 1000) * (1 + variacao / 100)).toFixed(2)),
        variacao_pct: Number(variacao.toFixed(2)),
        efeito_duration_brl: Number((-md * (bps / 100) * 10).toFixed(2)),
        efeito_convexidade_brl: Number((((titulo.convexidade ?? 0) * (bps / 100) ** 2) / 200).toFixed(2)),
        residuo_brl: 0.0,
      };
    }),
    fonte: FONTE_DEMO,
  };
}

// ---------------------------------------------------------------------------
// Registro de ativos B3 — ilustrativo (24 tickers, tipos variados)
// ---------------------------------------------------------------------------

function ativo(
  ticker: string,
  tipo: string,
  fechamento: number,
  especificacao: string,
  cnpj: string | null
): AtivoB3 {
  return {
    ticker,
    tipo,
    classificacao_confianca: tipo === "unit" ? "MEDIA" : "ALTA",
    cnpj_emissor: cnpj,
    ultimo_pregao: DATA_BASE_DEMO,
    ultimo_fechamento: fechamento,
    especificacao,
    ajustado_por_proventos: false,
  };
}

const ATIVOS_DEMO: AtivoB3[] = [
  ativo("PETR4", "acao_br", 41.35, "PN N2", "33.000.167/0001-01"),
  ativo("PETR3", "acao_br", 44.9, "ON N2", "33.000.167/0001-01"),
  ativo("VALE3", "acao_br", 63.8, "ON NM", "33.592.510/0001-54"),
  ativo("ITUB4", "acao_br", 37.25, "PN N1", "60.872.504/0001-23"),
  ativo("BBAS3", "acao_br", 29.1, "ON NM", "00.000.000/0001-91"),
  ativo("BBDC4", "acao_br", 16.45, "PN N1", "60.746.948/0001-12"),
  ativo("WEGE3", "acao_br", 39.6, "ON NM", "84.429.695/0001-11"),
  ativo("ABEV3", "acao_br", 13.2, "ON", "07.526.557/0001-00"),
  ativo("RENT3", "acao_br", 42.15, "ON NM", "16.670.085/0001-55"),
  ativo("SUZB3", "acao_br", 54.7, "ON NM", "16.404.287/0001-55"),
  ativo("PRIO3", "acao_br", 46.3, "ON NM", "10.629.105/0001-68"),
  ativo("EGIE3", "acao_br", 43.85, "ON NM", "02.474.103/0001-19"),
  ativo("TAEE11", "unit", 36.9, "UNT N2", "07.859.971/0001-30"),
  ativo("SAPR11", "unit", 33.4, "UNT N2", "76.484.013/0001-45"),
  ativo("HGLG11", "fii", 162.5, "CI", "11.728.688/0001-47"),
  ativo("KNRI11", "fii", 148.2, "CI", "12.005.956/0001-65"),
  ativo("MXRF11", "fii", 10.45, "CI", "97.521.225/0001-25"),
  ativo("XPML11", "fii", 118.7, "CI", "28.757.546/0001-00"),
  ativo("BOVA11", "etf_ou_fundo", 138.4, "CI", "10.406.511/0001-61"),
  ativo("IVVB11", "etf_ou_fundo", 372.1, "CI", "19.909.560/0001-91"),
  ativo("SMAL11", "etf_ou_fundo", 108.9, "CI", "10.406.600/0001-08"),
  ativo("AAPL34", "bdr", 68.2, "DRN", null),
  ativo("MSFT34", "bdr", 102.4, "DRN", null),
  ativo("AMZO34", "bdr", 57.8, "DRN", null),
];

function ativosPageDemo(params: URLSearchParams): AtivosPage {
  const tipo = params.get("tipo");
  const busca = params.get("busca")?.trim().toUpperCase() ?? "";
  const limite = Number(params.get("limite") ?? 50);
  const pagina = Number(params.get("pagina") ?? 1);

  let lista = ATIVOS_DEMO;
  if (tipo) lista = lista.filter((a) => a.tipo === tipo);
  if (busca) lista = lista.filter((a) => a.ticker.includes(busca));

  const tipos: Record<string, number> = {};
  for (const a of ATIVOS_DEMO) tipos[a.tipo] = (tipos[a.tipo] ?? 0) + 1;

  const inicio = (pagina - 1) * limite;
  return {
    total: lista.length,
    pagina,
    limite,
    data_base: DATA_BASE_DEMO,
    fonte: FONTE_DEMO,
    tipos,
    ativos: lista.slice(inicio, inicio + limite),
  };
}

function ativoDetalheDemo(ticker: string): AtivoDetalhe {
  const found = ATIVOS_DEMO.find((a) => a.ticker === ticker.toUpperCase());
  if (!found) {
    throw new IIOSApiError(
      404,
      "ativo_not_found",
      `Modo demonstração: o registro ilustrativo tem apenas ${ATIVOS_DEMO.length} tickers.`
    );
  }
  return { ...found, fonte: FONTE_DEMO };
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

const OVERVIEW_DEMO: Overview = {
  gerado_em: GERADO_EM_DEMO,
  screener: {
    run_date: DATA_BASE_DEMO,
    universo: 450,
    contagens: {
      aprovada: 7,
      quase_aprovada: 18,
      reprovada: 391,
      dados_insuficientes: 34,
    },
    aprovadas: [
      { ticker: "EGIE3", empresa: "Engie Brasil (demo)", pl: 9.4, pvpa: 1.8 },
      { ticker: "BBAS3", empresa: "Banco do Brasil (demo)", pl: 4.6, pvpa: 0.9 },
      { ticker: "TAEE11", empresa: "Taesa (demo)", pl: 8.1, pvpa: 1.6 },
      { ticker: "SAPR11", empresa: "Sanepar (demo)", pl: 5.2, pvpa: 0.7 },
      { ticker: "PRIO3", empresa: "PetroRio (demo)", pl: 6.8, pvpa: 1.4 },
      { ticker: "SUZB3", empresa: "Suzano (demo)", pl: 7.9, pvpa: 1.2 },
      { ticker: "WEGE3", empresa: "WEG (demo)", pl: 24.5, pvpa: 6.1 },
    ],
    preset: "quality_deep_value (DEMONSTRAÇÃO)",
  },
  tesouro: {
    data_base: DATA_BASE_DEMO,
    n_titulos: TESOURO_PAINEL_DEMO.titulos.length,
    janelas_no_radar: TESOURO_PAINEL_DEMO.radar_janelas.length,
    referencia_ipca2050: {
      taxa_pct: 6.85,
      percentil_historico: 88,
      threshold_monitorado_pct: 6.5,
      threshold_origem: "DEMONSTRAÇÃO — threshold ilustrativo",
    },
  },
  macro: {
    data_geracao: GERADO_EM_DEMO,
    regimes: MACRO_REGIMES_DEMO.regimes.map((r) => ({
      dimensao: r.dimensao,
      estado: r.estado,
      confianca: r.confianca,
      eh_expectativa: r.natureza.includes("EXPECTATIVA"),
    })),
  },
  carteira: {
    snapshots: 1,
    ultimo_snapshot_em: "2026-07-18T10:12:00-03:00",
    ips_confirmada: true,
  },
  saude_dados: {
    ultima_atualizacao_gold: {
      screener: GERADO_EM_DEMO,
      tesouro: GERADO_EM_DEMO,
      macro: GERADO_EM_DEMO,
    },
    auditoria_ingestao: GERADO_EM_DEMO,
    nota:
      "MODO DEMONSTRAÇÃO: painel com dados ilustrativos congelados — " +
      "não são dados reais de nenhuma fonte oficial.",
  },
};

// ---------------------------------------------------------------------------
// Perfil, IPS e carteira — ilustrativos
// ---------------------------------------------------------------------------

const ASSESSMENT_DEMO: LatestAssessment = {
  assessment_id: 1,
  scores: {
    horizonte: 78,
    tolerancia_risco: 62,
    capacidade_financeira: 70,
    conhecimento: 55,
    liquidez: 65,
  },
  conflicts: [
    "DEMONSTRAÇÃO: horizonte longo declarado, mas necessidade de liquidez em 12 meses.",
  ],
  confidence: "MEDIA",
  created_at: "2026-07-10T09:30:00-03:00",
};

const IPS_CONTENT_DEMO: Record<string, unknown> = {
  observacao:
    "DEMONSTRAÇÃO — IPS ilustrativa congelada; não é uma política real.",
  perfil: "moderado",
  horizonte_anos: 10,
  faixas_alocacao_pct: {
    renda_fixa: { min: 40, max: 60 },
    acoes_br: { min: 15, max: 30 },
    fiis: { min: 5, max: 15 },
    internacional: { min: 5, max: 15 },
    caixa: { min: 2, max: 10 },
  },
  limites: {
    max_por_emissor_pct: 10,
    max_por_ativo_pct: 8,
  },
  rebalanceamento: "aporte-first; vendas apenas em violação crítica",
};

const POLICY_VERSIONS_DEMO: PolicyVersion[] = [
  {
    version_id: 2,
    version: 2,
    status: "confirmed",
    created_at: "2026-07-12T08:00:00-03:00",
    author: "demo",
    reason: "DEMONSTRAÇÃO: ajuste ilustrativo das faixas de FIIs.",
    prev_version: 1,
    confirmed_at: "2026-07-12T08:05:00-03:00",
    content: IPS_CONTENT_DEMO,
  },
  {
    version_id: 1,
    version: 1,
    status: "superseded",
    created_at: "2026-07-10T10:00:00-03:00",
    author: "demo",
    reason: "DEMONSTRAÇÃO: primeira versão ilustrativa.",
    prev_version: null,
    confirmed_at: "2026-07-10T10:10:00-03:00",
    content: IPS_CONTENT_DEMO,
  },
];

const CONFIRMED_POLICY_DEMO: ConfirmedPolicy = {
  version_id: 2,
  version: 2,
  content: IPS_CONTENT_DEMO,
  confirmed_at: "2026-07-12T08:05:00-03:00",
};

const SNAPSHOTS_DEMO: SnapshotSummary[] = [
  { id: 1, version: 1, created_at: "2026-07-18T10:12:00-03:00", data_base: "2026-07-17" },
];

const SNAPSHOT_DETAIL_DEMO: SnapshotDetail = {
  snapshot: {
    ...SNAPSHOTS_DEMO[0],
    origem: "DEMONSTRAÇÃO — snapshot ilustrativo (sem importação real)",
  },
  positions: [
    { ticker: "ITUB4", quantity: 300, avg_cost: 31.4 },
    { ticker: "BBAS3", quantity: 400, avg_cost: 26.8 },
    { ticker: "WEGE3", quantity: 150, avg_cost: 36.2 },
    { ticker: "HGLG11", quantity: 60, avg_cost: 155.0 },
    { ticker: "IVVB11", quantity: 25, avg_cost: 330.0 },
    { ticker: "MXRF11", quantity: 900, avg_cost: 10.1 },
  ],
};

const QUALIDADE_DEMO = {
  posicoes_total: 6,
  posicoes_precificadas: 6,
  cobertura_pct: 100,
  sem_preco: [],
  custo_desconhecido: [],
  precos_stale_7d: [],
};

const ANALYSIS_DEMO: SnapshotAnalysis = {
  patrimonio_precificado_brl: 55405.5,
  nota_patrimonio:
    "DEMONSTRAÇÃO: patrimônio ilustrativo com preços congelados de " +
    DATA_BASE_DEMO +
    " — não ajustados por proventos.",
  pesos: {
    por_ativo: {
      ITUB4: 20.2,
      BBAS3: 21.0,
      WEGE3: 10.7,
      HGLG11: 17.6,
      IVVB11: 16.8,
      MXRF11: 13.7,
    },
    por_emissor: {
      "Itaú (demo)": 20.2,
      "Banco do Brasil (demo)": 21.0,
      "WEG (demo)": 10.7,
      "CSHG Logística (demo)": 17.6,
      "iShares (demo)": 16.8,
      "Maxi Renda (demo)": 13.7,
    },
    por_setor: {
      bancos: 41.2,
      bens_de_capital: 10.7,
      fundos_imobiliarios: 31.3,
      internacional: 16.8,
    },
    por_classe: {
      acoes_br: 51.9,
      fiis: 31.3,
      internacional: 16.8,
    },
    por_moeda: { BRL: 83.2, "USD (via ETF)": 16.8 },
    por_pais: { Brasil: 83.2, "EUA (via ETF)": 16.8 },
  },
  posicoes: [
    {
      ticker: "ITUB4",
      asset_class: "acao_br",
      quantity: 300,
      avg_cost: 31.4,
      cost_status: "conhecido",
      price: 37.25,
      price_date: DATA_BASE_DEMO,
      price_staleness_days: 0,
      market_value: 11175,
      weight_pct: 20.2,
      price_status: "ok",
      setor: "bancos",
      natureza: "renda variável",
    },
    {
      ticker: "BBAS3",
      asset_class: "acao_br",
      quantity: 400,
      avg_cost: 26.8,
      cost_status: "conhecido",
      price: 29.1,
      price_date: DATA_BASE_DEMO,
      price_staleness_days: 0,
      market_value: 11640,
      weight_pct: 21.0,
      price_status: "ok",
      setor: "bancos",
      natureza: "renda variável",
    },
    {
      ticker: "WEGE3",
      asset_class: "acao_br",
      quantity: 150,
      avg_cost: 36.2,
      cost_status: "conhecido",
      price: 39.6,
      price_date: DATA_BASE_DEMO,
      price_staleness_days: 0,
      market_value: 5940,
      weight_pct: 10.7,
      price_status: "ok",
      setor: "bens_de_capital",
      natureza: "renda variável",
    },
    {
      ticker: "HGLG11",
      asset_class: "fii",
      quantity: 60,
      avg_cost: 155.0,
      cost_status: "conhecido",
      price: 162.5,
      price_date: DATA_BASE_DEMO,
      price_staleness_days: 0,
      market_value: 9750,
      weight_pct: 17.6,
      price_status: "ok",
      setor: "fundos_imobiliarios",
      natureza: "renda variável",
    },
    {
      ticker: "IVVB11",
      asset_class: "etf",
      quantity: 25,
      avg_cost: 330.0,
      cost_status: "conhecido",
      price: 372.1,
      price_date: DATA_BASE_DEMO,
      price_staleness_days: 0,
      market_value: 9302.5,
      weight_pct: 16.8,
      price_status: "ok",
      setor: "internacional",
      natureza: "renda variável",
    },
    {
      ticker: "MXRF11",
      asset_class: "fii",
      quantity: 900,
      avg_cost: 10.1,
      cost_status: "conhecido",
      price: 10.45,
      price_date: DATA_BASE_DEMO,
      price_staleness_days: 0,
      market_value: 9405,
      weight_pct: 13.7,
      price_status: "ok",
      setor: "fundos_imobiliarios",
      natureza: "renda variável",
    },
  ],
  concentracao: {
    maior_posicao_pct: 21.0,
    hhi: 1815,
  },
  violacoes: [
    {
      tipo: "classe_acima_da_faixa",
      chave: "acoes_br",
      peso_pct: 51.9,
      severidade: "nao_critica",
      faixa: { min_pct: 15, max_pct: 30 },
      limite_pct: null,
    },
    {
      tipo: "classe_abaixo_da_faixa",
      chave: "renda_fixa",
      peso_pct: 0,
      severidade: "critica",
      faixa: { min_pct: 40, max_pct: 60 },
      limite_pct: null,
    },
  ],
  qualidade_dados: QUALIDADE_DEMO,
  confianca: "MEDIA",
  fontes: {
    precos: FONTE_DEMO,
    cadastro: FONTE_DEMO,
    ips: "DEMONSTRAÇÃO — IPS ilustrativa v2",
  },
  data_base_carteira: "2026-07-17",
  data_analise: GERADO_EM_DEMO,
};

const REBALANCE_PLAN_DEMO: RebalancePlan = {
  plan_id: 1,
  aporte_mensal_brl: 2000,
  premissas: [
    "MODO DEMONSTRAÇÃO: plano ilustrativo congelado — não é recomendação.",
    "Aporte-first: nenhuma venda é sugerida fora de violação crítica.",
    "Preços de " + DATA_BASE_DEMO + " (ilustrativos), não ajustados por proventos.",
    "Impostos e custos de corretagem não considerados nesta demonstração.",
  ],
  proximo_aporte: { renda_fixa: 1600, caixa: 400 },
  plano_3_meses: [
    { renda_fixa: 1600, caixa: 400 },
    { renda_fixa: 1800, internacional: 200 },
    { renda_fixa: 1700, fiis: 300 },
  ],
  plano_6_meses: [
    { renda_fixa: 1600, caixa: 400 },
    { renda_fixa: 1800, internacional: 200 },
    { renda_fixa: 1700, fiis: 300 },
    { renda_fixa: 1600, acoes_br: 400 },
    { renda_fixa: 1500, internacional: 500 },
    { renda_fixa: 1400, fiis: 600 },
  ],
  caminho_ate_faixas: {
    dentro_das_faixas_apos_simulacao: false,
    pesos_projetados_pct: {
      renda_fixa: 16.5,
      acoes_br: 43.4,
      fiis: 26.7,
      internacional: 10.1,
      caixa: 3.3,
    },
  },
  vendas_evitadas_brl: 12840,
  concentracao_antes: { maior_posicao_pct: 21.0, hhi: 1815 },
  exposicao_cambial_antes: { "USD (via ETF)": 16.8 },
  violacoes_remanescentes: [
    {
      tipo: "classe_abaixo_da_faixa",
      chave: "renda_fixa",
      peso_pct: 16.5,
      severidade: "nao_critica",
      faixa: { min_pct: 40, max_pct: 60 },
      limite_pct: null,
    },
  ],
  acoes: [
    {
      seq: 1,
      scope: "classe",
      key: "renda_fixa",
      action: "aportar",
      priority: 1,
      amount_brl: 1600,
      current_pct: 0,
      target_min_pct: 40,
      target_max_pct: 60,
      rationale:
        "DEMONSTRAÇÃO: violação crítica — classe abaixo da faixa mínima da IPS.",
      revisao: "reavaliar no próximo aporte",
      custo_imposto: "não considerado (demonstração)",
    },
    {
      seq: 2,
      scope: "classe",
      key: "caixa",
      action: "aportar",
      priority: 2,
      amount_brl: 400,
      current_pct: 0,
      target_min_pct: 2,
      target_max_pct: 10,
      rationale: "DEMONSTRAÇÃO: recompor reserva mínima de caixa da IPS.",
      revisao: null,
      custo_imposto: null,
    },
  ],
  confianca: "MEDIA",
  qualidade_dados: QUALIDADE_DEMO,
};

const ISSUES_DEMO: PortfolioIssue[] = [
  {
    id: 1,
    created_at: "2026-07-18T10:12:05-03:00",
    scope: "importacao",
    severity: "info",
    description:
      "DEMONSTRAÇÃO: snapshot ilustrativo criado sem importação real de extrato.",
  },
];

// ---------------------------------------------------------------------------
// Chat "Pergunte à IA" — resposta canned, sem LLM
// ---------------------------------------------------------------------------

const CHAT_FERRAMENTAS_DEMO: ChatFerramentas = {
  ferramentas: [
    { nome: "consultar_screener", descricao: "Resultado do screener gold (aprovadas, contagens, critérios)." },
    { nome: "consultar_ativo", descricao: "Ficha de um ativo do registro B3 com fonte e data-base." },
    { nome: "comparar_ativos", descricao: "Comparação lado a lado de métricas já calculadas." },
    { nome: "consultar_carteira", descricao: "Análise do snapshot mais recente (pesos, violações, qualidade)." },
    { nome: "consultar_rebalanceamento", descricao: "Plano aporte-first vigente." },
    { nome: "consultar_tesouro", descricao: "Painel Tesouro Direto (títulos, radar, cenários)." },
    { nome: "consultar_macro", descricao: "Regimes macro e séries do BCB." },
    { nome: "consultar_metricas", descricao: "Registro de métricas (fórmula, unidade, statuses)." },
    { nome: "consultar_fontes", descricao: "Registro de fontes oficiais e data-bases." },
    { nome: "consultar_intradiario", descricao: "Cotação indicativa de agregador (nunca em cálculos)." },
    { nome: "gerar_contra_tese", descricao: "Contra-argumentos determinísticos a partir do gold." },
  ],
  nota:
    "MODO DEMONSTRAÇÃO: o chat real usa estas ferramentas determinísticas via " +
    "backend com ANTHROPIC_API_KEY; aqui a resposta é uma fixture congelada.",
};

const CHAT_RESPOSTA_DEMO: ChatResposta = {
  resposta: {
    resposta_direta:
      "Esta é uma resposta de DEMONSTRAÇÃO (fixture congelada, sem LLM). No " +
      "sistema real, eu consultaria as ferramentas determinísticas do backend " +
      "e cada número viria com fonte e data-base. Exemplo ilustrativo: o " +
      "screener de demonstração lista 7 aprovadas em um universo de 450 " +
      "companhias, e o Tesouro IPCA+ 2050 ilustrativo está a 6,85% a.a. real.",
    evidencias: [
      {
        afirmacao: "Aprovadas no screener (demonstração)",
        valor: 7,
        fonte: FONTE_DEMO,
        data_base: DATA_BASE_DEMO,
      },
      {
        afirmacao: "Taxa ilustrativa do Tesouro IPCA+ 2050 (% a.a. real)",
        valor: "6,85",
        fonte: FONTE_DEMO,
        data_base: DATA_BASE_DEMO,
      },
    ],
    fontes: [FONTE_DEMO],
    data_base: DATA_BASE_DEMO,
    premissas: [
      "MODO DEMONSTRAÇÃO: resposta idêntica para qualquer pergunta.",
      "Nenhum dado aqui provém de fonte oficial.",
    ],
    confianca: "BAIXA",
    riscos: [
      "Tratar dados de demonstração como reais levaria a conclusões erradas.",
    ],
    contra_argumento:
      "Nada do que está nesta resposta deve influenciar decisões: os valores " +
      "são ilustrativos e o chat real exige o backend com ANTHROPIC_API_KEY.",
    dados_ausentes: [
      "Todos os dados reais (CVM, B3, Tesouro, BCB) — indisponíveis no modo demonstração.",
    ],
    gatilhos_revisao: [
      "Conectar o frontend ao backend real desativa este modo.",
    ],
  },
  ferramentas_chamadas: [
    {
      ferramenta: "consultar_screener",
      argumentos: { preset: "quality_deep_value" },
      ok: true,
      codigo_erro: null,
    },
    {
      ferramenta: "consultar_tesouro",
      argumentos: { tipo: "Tesouro IPCA+", vencimento: "2050-08-15" },
      ok: true,
      codigo_erro: null,
    },
  ],
  modelo: "demo-fixture (sem LLM)",
};

// ---------------------------------------------------------------------------
// Roteador do modo demonstração
// ---------------------------------------------------------------------------

function route(path: string, method: string): unknown {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const parts = pathname.split("/").filter(Boolean);

  if (method === "GET") {
    if (pathname === "/overview") return OVERVIEW_DEMO;
    if (pathname === "/macro/regimes") return MACRO_REGIMES_DEMO;
    if (parts[0] === "macro" && parts[1] === "series" && parts[2]) {
      const serieId = decodeURIComponent(parts[2]);
      const pontos = SERIES_DEMO[serieId];
      if (!pontos) {
        throw new IIOSApiError(
          404,
          "serie_not_found",
          "Modo demonstração: série ilustrativa inexistente."
        );
      }
      const payload: MacroSerie = { serie_id: serieId, pontos, fonte: FONTE_DEMO };
      return payload;
    }
    if (pathname === "/tesouro/titulos") return TESOURO_PAINEL_DEMO;
    if (
      parts[0] === "tesouro" &&
      parts[1] === "titulos" &&
      parts.length === 5 &&
      parts[4] === "cenarios"
    ) {
      return cenariosDemo(decodeURIComponent(parts[2]), decodeURIComponent(parts[3]));
    }
    if (pathname === "/ativos") return ativosPageDemo(params);
    if (parts[0] === "ativos" && parts.length === 2) {
      return ativoDetalheDemo(decodeURIComponent(parts[1]));
    }
    if (parts[0] === "ativos" && parts[2] === "intradiario") {
      throw new IIOSApiError(
        503,
        "intradiario_indisponivel",
        "Modo demonstração: cotação intradiária de agregador desabilitada — " +
          "use o fechamento ilustrativo D-1 exibido na tabela."
      );
    }
    if (pathname === "/chat/ferramentas") return CHAT_FERRAMENTAS_DEMO;
    if (pathname === "/profile/assessment/latest") return ASSESSMENT_DEMO;
    if (pathname === "/policy/versions") return POLICY_VERSIONS_DEMO;
    if (pathname === "/policy/confirmed") return CONFIRMED_POLICY_DEMO;
    if (pathname === "/portfolio/snapshots") return SNAPSHOTS_DEMO;
    if (parts[0] === "portfolio" && parts[1] === "snapshots" && parts.length === 3) {
      return SNAPSHOT_DETAIL_DEMO;
    }
    if (
      parts[0] === "portfolio" &&
      parts[1] === "snapshots" &&
      parts[3] === "analysis"
    ) {
      return ANALYSIS_DEMO;
    }
    if (pathname === "/portfolio/issues") return ISSUES_DEMO;
  }

  if (method === "POST") {
    if (pathname === "/chat") return CHAT_RESPOSTA_DEMO;
    if (
      parts[0] === "portfolio" &&
      parts[1] === "snapshots" &&
      parts[3] === "rebalance"
    ) {
      return REBALANCE_PLAN_DEMO;
    }
    // Demais mutações (perfil, IPS, importação) exigem o backend real.
    demoBlockedAction();
  }

  throw new IIOSApiError(
    404,
    "demo_rota_inexistente",
    "Modo demonstração: rota sem fixture ilustrativa."
  );
}

/** Ponto de entrada usado por `request()` quando o modo demonstração está ativo. */
export async function demoRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, DEMO_LATENCY_MS));
  const method = (init?.method ?? "GET").toUpperCase();
  return route(path, method) as T;
}
