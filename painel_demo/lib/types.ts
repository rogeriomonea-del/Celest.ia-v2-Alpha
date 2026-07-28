export type AssetClass =
  | "Ações"
  | "FIIs"
  | "Renda Fixa"
  | "ETFs"
  | "BDRs"
  | "Caixa";

export const ASSET_CLASSES: readonly AssetClass[] = [
  "Ações",
  "FIIs",
  "Renda Fixa",
  "ETFs",
  "BDRs",
  "Caixa",
] as const;

export interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  investedValue: number;
  marketValue: number;
  gain: number;
  gainPercent: number;
  dividendYield: number | null;
  priceEarnings: number | null;
  priceToBook: number | null;
  volatility: number | null;
  source: "upload" | "manual" | "sample";
}

export interface ParsedPositionInput {
  ticker: string;
  name?: string;
  quantity: number;
  averagePrice: number;
  totalValue?: number;
  assetClass?: AssetClass;
}

export interface ParseReport {
  fileName: string;
  format: "csv" | "xlsx" | "json";
  rowsRead: number;
  positionsParsed: number;
  skippedRows: number;
  detectedColumns: Record<string, string>;
  warnings: string[];
}

export interface QuoteData {
  ticker: string;
  shortName: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  dividendYield: number | null;
  priceEarnings: number | null;
  priceToBook: number | null;
  marketCap: number | null;
  logoUrl: string | null;
  source: "brapi" | "fallback";
}

export interface QuotesResponse {
  quotes: QuoteData[];
  source: "brapi" | "fallback" | "mixed";
  fetchedAt: string;
}

export type RiskProfile = "Conservador" | "Moderado" | "Arrojado";

export interface ProfileAnswer {
  questionId: number;
  optionIndex: number;
  score: number;
}

export interface ProfileResult {
  profile: RiskProfile;
  score: number;
  maxScore: number;
  completedAt: string;
  answers: ProfileAnswer[];
  recommendedAllocation: Record<AssetClass, number>;
}

export type TransactionType = "receita" | "despesa";

export interface CashflowTransaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  source: "manual" | "openfinance";
  bank?: string;
}

export interface BankConnection {
  bankId: string;
  bankName: string;
  connectedAt: string;
  accountMask: string;
  balance: number;
}

export interface RebalanceTarget {
  key: string;
  targetPercent: number;
}

export type RebalanceAction = "COMPRAR" | "VENDER" | "MANTER";

export interface RebalanceRow {
  key: string;
  label: string;
  assetClass: AssetClass;
  currentValue: number;
  currentPercent: number;
  targetPercent: number;
  targetValue: number;
  deviation: number;
  deltaValue: number;
  action: RebalanceAction;
  unitPrice: number | null;
  units: number | null;
}

export interface RebalanceSummary {
  rows: RebalanceRow[];
  totalValue: number;
  totalBuy: number;
  totalSell: number;
  targetSum: number;
  isValid: boolean;
  maxDeviation: number;
}

export interface EquityPoint {
  month: string;
  label: string;
  invested: number;
  marketValue: number;
}

export interface AllocationSlice {
  assetClass: AssetClass;
  value: number;
  percent: number;
}

export interface VolatilityPoint {
  ticker: string;
  volatility: number;
}

export interface MonthlyCashflowPoint {
  month: string;
  label: string;
  receitas: number;
  despesas: number;
  saldo: number;
}
