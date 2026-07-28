"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  BankConnection,
  CashflowTransaction,
  ParsedPositionInput,
  ParseReport,
  PortfolioPosition,
  ProfileResult,
  QuoteData,
} from "@/lib/types";
import { findMarketAsset, inferAssetClass } from "@/lib/agents/market-data";
import { generateId } from "@/lib/utils";

const STORAGE_KEY = "celestia_app_state_v1";

interface PersistedState {
  positions: PortfolioPosition[];
  lastParseReport: ParseReport | null;
  profile: ProfileResult | null;
  transactions: CashflowTransaction[];
  bankConnections: BankConnection[];
}

interface AppStore extends PersistedState {
  hydrated: boolean;
  importPositions: (inputs: ParsedPositionInput[], report: ParseReport | null) => void;
  loadSamplePortfolio: () => void;
  clearPortfolio: () => void;
  applyQuotes: (quotes: QuoteData[]) => void;
  saveProfile: (profile: ProfileResult) => void;
  clearProfile: () => void;
  addTransaction: (tx: Omit<CashflowTransaction, "id">) => void;
  removeTransaction: (id: string) => void;
  importOpenFinance: (
    connection: BankConnection,
    transactions: Array<Omit<CashflowTransaction, "id">>
  ) => void;
  disconnectBank: (bankId: string) => void;
}

const AppStoreContext = createContext<AppStore | null>(null);

const EMPTY_STATE: PersistedState = {
  positions: [],
  lastParseReport: null,
  profile: null,
  transactions: [],
  bankConnections: [],
};

function buildPosition(
  input: ParsedPositionInput,
  source: PortfolioPosition["source"]
): PortfolioPosition {
  const marketAsset = findMarketAsset(input.ticker);
  const currentPrice = marketAsset?.price ?? input.averagePrice;
  const investedValue = input.quantity * input.averagePrice;
  const marketValue = input.quantity * currentPrice;
  const gain = marketValue - investedValue;

  return {
    id: generateId("pos"),
    ticker: input.ticker.toUpperCase(),
    name: input.name ?? marketAsset?.name ?? input.ticker.toUpperCase(),
    assetClass: input.assetClass ?? inferAssetClass(input.ticker),
    quantity: input.quantity,
    averagePrice: input.averagePrice,
    currentPrice,
    investedValue,
    marketValue,
    gain,
    gainPercent: investedValue > 0 ? (gain / investedValue) * 100 : 0,
    dividendYield: marketAsset?.dividendYield ?? null,
    priceEarnings: marketAsset?.priceEarnings ?? null,
    priceToBook: marketAsset?.priceToBook ?? null,
    volatility: marketAsset?.volatility ?? null,
    source,
  };
}

const SAMPLE_PORTFOLIO: ParsedPositionInput[] = [
  { ticker: "PETR4", quantity: 300, averagePrice: 32.1 },
  { ticker: "VALE3", quantity: 150, averagePrice: 68.4 },
  { ticker: "ITUB4", quantity: 400, averagePrice: 27.85 },
  { ticker: "BBAS3", quantity: 350, averagePrice: 24.6 },
  { ticker: "TAEE11", quantity: 260, averagePrice: 33.9 },
  { ticker: "BBSE3", quantity: 180, averagePrice: 31.2 },
  { ticker: "WEGE3", quantity: 120, averagePrice: 41.75 },
  { ticker: "HGLG11", quantity: 45, averagePrice: 162.3 },
  { ticker: "MXRF11", quantity: 900, averagePrice: 10.12 },
  { ticker: "XPML11", quantity: 70, averagePrice: 98.7 },
  { ticker: "BOVA11", quantity: 50, averagePrice: 112.6 },
  { ticker: "IVVB11", quantity: 25, averagePrice: 298.4 },
  {
    ticker: "TESOURO SELIC 2029",
    name: "Tesouro Selic 2029",
    quantity: 4.2,
    averagePrice: 14550.0,
    assetClass: "Renda Fixa",
  },
];

function recomputePosition(position: PortfolioPosition): PortfolioPosition {
  const investedValue = position.quantity * position.averagePrice;
  const marketValue = position.quantity * position.currentPrice;
  const gain = marketValue - investedValue;
  return {
    ...position,
    investedValue,
    marketValue,
    gain,
    gainPercent: investedValue > 0 ? (gain / investedValue) * 100 : 0,
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        setState({
          positions: Array.isArray(parsed.positions) ? parsed.positions : [],
          lastParseReport: parsed.lastParseReport ?? null,
          profile: parsed.profile ?? null,
          transactions: Array.isArray(parsed.transactions)
            ? parsed.transactions
            : [],
          bankConnections: Array.isArray(parsed.bankConnections)
            ? parsed.bankConnections
            : [],
        });
      }
    } catch {
      setState(EMPTY_STATE);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage cheio ou indisponível — estado permanece apenas em memória
    }
  }, [state, hydrated]);

  const importPositions = useCallback(
    (inputs: ParsedPositionInput[], report: ParseReport | null) => {
      setState((prev) => ({
        ...prev,
        positions: inputs.map((input) => buildPosition(input, "upload")),
        lastParseReport: report,
      }));
    },
    []
  );

  const loadSamplePortfolio = useCallback(() => {
    setState((prev) => ({
      ...prev,
      positions: SAMPLE_PORTFOLIO.map((input) => buildPosition(input, "sample")),
      lastParseReport: {
        fileName: "carteira-exemplo.celestia",
        format: "json",
        rowsRead: SAMPLE_PORTFOLIO.length,
        positionsParsed: SAMPLE_PORTFOLIO.length,
        skippedRows: 0,
        detectedColumns: {
          Ativo: "ticker",
          Quantidade: "quantity",
          "Preço médio": "averagePrice",
        },
        warnings: [],
      },
    }));
  }, []);

  const clearPortfolio = useCallback(() => {
    setState((prev) => ({ ...prev, positions: [], lastParseReport: null }));
  }, []);

  const applyQuotes = useCallback((quotes: QuoteData[]) => {
    if (quotes.length === 0) return;
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));
    setState((prev) => ({
      ...prev,
      positions: prev.positions.map((position) => {
        const quote = quoteMap.get(position.ticker);
        if (!quote || quote.currentPrice <= 0) return position;
        return recomputePosition({
          ...position,
          currentPrice: quote.currentPrice,
          dividendYield: quote.dividendYield ?? position.dividendYield,
          priceEarnings: quote.priceEarnings ?? position.priceEarnings,
          priceToBook: quote.priceToBook ?? position.priceToBook,
        });
      }),
    }));
  }, []);

  const saveProfile = useCallback((profile: ProfileResult) => {
    setState((prev) => ({ ...prev, profile }));
  }, []);

  const clearProfile = useCallback(() => {
    setState((prev) => ({ ...prev, profile: null }));
  }, []);

  const addTransaction = useCallback((tx: Omit<CashflowTransaction, "id">) => {
    setState((prev) => ({
      ...prev,
      transactions: [{ ...tx, id: generateId("tx") }, ...prev.transactions],
    }));
  }, []);

  const removeTransaction = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
  }, []);

  const importOpenFinance = useCallback(
    (
      connection: BankConnection,
      transactions: Array<Omit<CashflowTransaction, "id">>
    ) => {
      setState((prev) => ({
        ...prev,
        bankConnections: [
          ...prev.bankConnections.filter((c) => c.bankId !== connection.bankId),
          connection,
        ],
        transactions: [
          ...transactions.map((tx) => ({ ...tx, id: generateId("tx") })),
          ...prev.transactions.filter(
            (t) => !(t.source === "openfinance" && t.bank === connection.bankName)
          ),
        ],
      }));
    },
    []
  );

  const disconnectBank = useCallback((bankId: string) => {
    setState((prev) => {
      const connection = prev.bankConnections.find((c) => c.bankId === bankId);
      return {
        ...prev,
        bankConnections: prev.bankConnections.filter((c) => c.bankId !== bankId),
        transactions: connection
          ? prev.transactions.filter(
              (t) =>
                !(t.source === "openfinance" && t.bank === connection.bankName)
            )
          : prev.transactions,
      };
    });
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      ...state,
      hydrated,
      importPositions,
      loadSamplePortfolio,
      clearPortfolio,
      applyQuotes,
      saveProfile,
      clearProfile,
      addTransaction,
      removeTransaction,
      importOpenFinance,
      disconnectBank,
    }),
    [
      state,
      hydrated,
      importPositions,
      loadSamplePortfolio,
      clearPortfolio,
      applyQuotes,
      saveProfile,
      clearProfile,
      addTransaction,
      removeTransaction,
      importOpenFinance,
      disconnectBank,
    ]
  );

  return (
    <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStore {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error("useAppStore deve ser usado dentro de <AppStoreProvider>");
  }
  return context;
}
