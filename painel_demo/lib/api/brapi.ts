import type { QuoteData, QuotesResponse } from "@/lib/types";
import { findMarketAsset } from "@/lib/agents/market-data";

const BRAPI_BASE_URL = "https://brapi.dev/api";
const FALLBACK_TOKEN = "o3G7gqznyRe3PzEim7WiPJ";
const REQUEST_TIMEOUT_MS = 8000;

interface BrapiQuoteResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  priceEarnings?: number | null;
  earningsPerShare?: number | null;
  marketCap?: number | null;
  logourl?: string | null;
  dividendYield?: number | null;
  priceToBook?: number | null;
}

interface BrapiResponse {
  results?: BrapiQuoteResult[];
  error?: boolean;
  message?: string;
}

function getBrapiToken(): string {
  return process.env.BRAPI_TOKEN?.trim() || FALLBACK_TOKEN;
}

function buildFallbackQuote(ticker: string): QuoteData {
  const asset = findMarketAsset(ticker);
  if (asset) {
    return {
      ticker: asset.ticker,
      shortName: asset.name,
      currentPrice: asset.price,
      change: Number(((asset.price * asset.changePercent) / 100).toFixed(2)),
      changePercent: asset.changePercent,
      dividendYield: asset.dividendYield,
      priceEarnings: asset.priceEarnings,
      priceToBook: asset.priceToBook,
      marketCap: asset.marketCapBn * 1_000_000_000,
      logoUrl: null,
      source: "fallback",
    };
  }
  return {
    ticker: ticker.toUpperCase(),
    shortName: ticker.toUpperCase(),
    currentPrice: 0,
    change: 0,
    changePercent: 0,
    dividendYield: null,
    priceEarnings: null,
    priceToBook: null,
    marketCap: null,
    logoUrl: null,
    source: "fallback",
  };
}

function mapBrapiResult(result: BrapiQuoteResult): QuoteData {
  const fallback = findMarketAsset(result.symbol);
  return {
    ticker: result.symbol.toUpperCase(),
    shortName: result.shortName ?? result.longName ?? result.symbol,
    currentPrice: result.regularMarketPrice ?? fallback?.price ?? 0,
    change: result.regularMarketChange ?? 0,
    changePercent: result.regularMarketChangePercent ?? 0,
    dividendYield: result.dividendYield ?? fallback?.dividendYield ?? null,
    priceEarnings: result.priceEarnings ?? fallback?.priceEarnings ?? null,
    priceToBook: result.priceToBook ?? fallback?.priceToBook ?? null,
    marketCap: result.marketCap ?? null,
    logoUrl: result.logourl ?? null,
    source: "brapi",
  };
}

export async function fetchQuotes(tickers: string[]): Promise<QuotesResponse> {
  const cleaned = Array.from(
    new Set(
      tickers
        .map((t) => t.toUpperCase().trim())
        .filter((t) => /^[A-Z0-9]{4,10}$/.test(t))
    )
  );

  if (cleaned.length === 0) {
    return { quotes: [], source: "fallback", fetchedAt: new Date().toISOString() };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = `${BRAPI_BASE_URL}/quote/${cleaned.join(",")}?token=${getBrapiToken()}&fundamental=true`;
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`brapi respondeu com status ${response.status}`);
    }

    const payload = (await response.json()) as BrapiResponse;
    if (payload.error || !payload.results || payload.results.length === 0) {
      throw new Error(payload.message ?? "brapi retornou payload vazio");
    }

    const fetched = payload.results.map(mapBrapiResult);
    const fetchedTickers = new Set(fetched.map((q) => q.ticker));
    const missing = cleaned
      .filter((t) => !fetchedTickers.has(t))
      .map(buildFallbackQuote);

    return {
      quotes: [...fetched, ...missing],
      source: missing.length > 0 ? "mixed" : "brapi",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return {
      quotes: cleaned.map(buildFallbackQuote),
      source: "fallback",
      fetchedAt: new Date().toISOString(),
    };
  }
}
