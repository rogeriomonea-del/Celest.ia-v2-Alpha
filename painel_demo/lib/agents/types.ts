export type AgentId = "triagem" | "pesquisa" | "auditor" | "dre" | "comite";

export type AgentStatus = "idle" | "queued" | "running" | "done" | "error";

export type LogLevel = "info" | "data" | "success" | "warn" | "error";

export interface AgentLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface AgentDefinition {
  id: AgentId;
  order: number;
  name: string;
  codename: string;
  description: string;
  dependsOn: AgentId[];
}

export interface ScreeningCriteria {
  minDividendYield: number;
  maxPriceToBook: number;
  maxPriceEarnings: number;
  minRoe: number;
}

export interface ScreenedCandidate {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  dividendYield: number;
  priceEarnings: number | null;
  priceToBook: number | null;
  roe: number | null;
  score: number;
  highlights: string[];
}

export interface TriagemResult {
  universeSize: number;
  criteria: ScreeningCriteria;
  candidates: ScreenedCandidate[];
  rejectedCount: number;
}

export interface ContextDossier {
  ticker: string;
  name: string;
  governance: string;
  governanceNote: string;
  sentimentScore: number;
  sentimentLabel: "positivo" | "neutro" | "negativo";
  keyFacts: string[];
  riskFlags: string[];
}

export interface PesquisaResult {
  dossiers: ContextDossier[];
  sourcesConsulted: number;
}

export interface AuditVerdict {
  ticker: string;
  approved: boolean;
  compositeScore: number;
  reasons: string[];
}

export interface AuditorResult {
  verdicts: AuditVerdict[];
  approvedTickers: string[];
  cutRate: number;
}

export interface DREAnalysis {
  ticker: string;
  period: string;
  netIncomeBn: number;
  netIncomeYoYGrowth: number | null;
  netMarginPercent: number;
  marginTrend: "expansão" | "estável" | "compressão";
  netDebtToEbitda: number | null;
  leverageAssessment: string;
  dreScore: number;
  passed: boolean;
  notes: string[];
}

export interface DREResult {
  analyses: DREAnalysis[];
  finalists: string[];
}

export interface CommitteePick {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  finalScore: number;
  currentPrice: number;
  dividendYield: number;
  suggestedAllocationPercent: number;
  thesis: string;
  macroJustification: string;
  risks: string[];
}

export interface ComiteResult {
  picks: CommitteePick[];
  marketOutlook: string;
  disclaimer: string;
  generatedAt: string;
}

export interface AgentStepResponse<T> {
  agentId: AgentId;
  status: "done" | "error";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  logs: AgentLogEntry[];
  result: T | null;
  error: string | null;
}

export type PipelineScope = "carteira" | "mercado";

export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  {
    id: "triagem",
    order: 1,
    name: "Agente 1 — Triagem Técnica",
    codename: "SCREENER-01",
    description:
      "Varre o universo de ativos filtrando pelos melhores indicadores fundamentalistas (DY, P/VP, P/L, ROE).",
    dependsOn: [],
  },
  {
    id: "pesquisa",
    order: 2,
    name: "Agente 2 — Pesquisa de Contexto",
    codename: "RESEARCH-02",
    description:
      "Coleta fatos relevantes, notícias corporativas recentes e avaliação de governança de cada empresa.",
    dependsOn: [],
  },
  {
    id: "auditor",
    order: 3,
    name: "Agente 3 — Auditor de Filtros",
    codename: "AUDIT-03",
    description:
      "Cruza os dados da triagem com a pesquisa de contexto, valida inconsistências e aplica cortes severos.",
    dependsOn: ["triagem", "pesquisa"],
  },
  {
    id: "dre",
    order: 4,
    name: "Agente 4 — Analista de DRE",
    codename: "DRE-04",
    description:
      "Extrai dados do último balanço semestral das finalistas: lucro líquido, margem líquida e alavancagem.",
    dependsOn: ["auditor"],
  },
  {
    id: "comite",
    order: 5,
    name: "Agente 5 — Comitê de Investimento",
    codename: "COMMITTEE-05",
    description:
      "Consolida as notas de todos os agentes e entrega o relatório final com as 5 ações mais promissoras.",
    dependsOn: ["dre"],
  },
] as const;

export const DEFAULT_CRITERIA: ScreeningCriteria = {
  minDividendYield: 6.0,
  maxPriceToBook: 5.0,
  maxPriceEarnings: 12.0,
  minRoe: 12.0,
};
