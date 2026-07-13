"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Percent,
  PiggyBank,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  allocationByClass,
  buildEquityCurve,
  portfolioTotals,
  volatilitySeries,
} from "@/lib/finance";
import type { ParsedPositionInput, ParseReport, QuotesResponse } from "@/lib/types";
import { formatBRL, formatPercent, formatPercentPlain } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDropzone } from "@/components/file-dropzone";
import { PortfolioTable } from "@/components/portfolio-table";
import { StatCard } from "@/components/stat-card";
import { AllocationDonut } from "@/components/charts/allocation-donut";
import { EquityArea } from "@/components/charts/equity-area";
import { VolatilityChart } from "@/components/charts/volatility-chart";

export default function DashboardPage() {
  const {
    positions,
    lastParseReport,
    hydrated,
    importPositions,
    loadSamplePortfolio,
    clearPortfolio,
    applyQuotes,
  } = useAppStore();

  const [parseError, setParseError] = useState<string | null>(null);
  const [quoteState, setQuoteState] = useState<{
    loading: boolean;
    source: QuotesResponse["source"] | null;
    fetchedAt: string | null;
  }>({ loading: false, source: null, fetchedAt: null });

  const tickerKey = useMemo(
    () =>
      positions
        .map((p) => p.ticker)
        .filter((t) => /^[A-Z0-9]{4,10}$/.test(t))
        .sort()
        .join(","),
    [positions]
  );
  const lastFetchedKey = useRef<string>("");

  const refreshQuotes = useCallback(async () => {
    if (!tickerKey) return;
    setQuoteState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch(`/api/quotes?tickers=${tickerKey}`);
      if (!response.ok) throw new Error("Falha ao buscar cotações");
      const payload = (await response.json()) as QuotesResponse;
      applyQuotes(payload.quotes);
      setQuoteState({
        loading: false,
        source: payload.source,
        fetchedAt: payload.fetchedAt,
      });
    } catch {
      setQuoteState({ loading: false, source: "fallback", fetchedAt: null });
    }
  }, [tickerKey, applyQuotes]);

  useEffect(() => {
    if (!hydrated || !tickerKey || lastFetchedKey.current === tickerKey) return;
    lastFetchedKey.current = tickerKey;
    void refreshQuotes();
  }, [hydrated, tickerKey, refreshQuotes]);

  const handleParsed = useCallback(
    (parsed: ParsedPositionInput[], report: ParseReport) => {
      setParseError(null);
      importPositions(parsed, report);
    },
    [importPositions]
  );

  const totals = useMemo(() => portfolioTotals(positions), [positions]);
  const allocation = useMemo(() => allocationByClass(positions), [positions]);
  const equityCurve = useMemo(() => buildEquityCurve(positions), [positions]);
  const volatility = useMemo(() => volatilitySeries(positions), [positions]);

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const hasPortfolio = positions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Carteira consolidada, indicadores fundamentalistas e evolução
            patrimonial.
          </p>
        </div>
        {hasPortfolio && (
          <div className="flex flex-wrap items-center gap-2">
            {quoteState.source && (
              <Badge variant={quoteState.source === "fallback" ? "warning" : "default"}>
                {quoteState.source === "fallback"
                  ? "cotações offline (fallback)"
                  : quoteState.source === "mixed"
                    ? "brapi.dev + fallback"
                    : "cotações brapi.dev"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshQuotes()}
              disabled={quoteState.loading}
            >
              <RefreshCw
                className={quoteState.loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Atualizar cotações
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearPortfolio();
                setParseError(null);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        )}
      </div>

      {parseError && (
        <div className="flex items-start gap-3 rounded-xl border border-loss/30 bg-loss/[0.07] px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <div>
            <p className="font-medium text-loss">Falha ao importar arquivo</p>
            <p className="text-muted-foreground">{parseError}</p>
          </div>
        </div>
      )}

      {!hasPortfolio ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <FileDropzone onParsed={handleParsed} onError={setParseError} />
          <Card className="flex flex-col justify-center">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Comece em segundos
              </CardTitle>
              <CardDescription>
                Importe o relatório de posição da B3 (Área do Investidor),
                extratos de corretoras ou um JSON próprio. Ou explore a
                plataforma com uma carteira de demonstração realista.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadSamplePortfolio}>
                <PiggyBank className="h-4 w-4" />
                Carregar carteira exemplo
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Patrimônio total"
              value={formatBRL(totals.marketValue)}
              helper={`Aportado: ${formatBRL(totals.invested)}`}
              icon={Banknote}
            />
            <StatCard
              label="Ganho / Perda"
              value={formatBRL(totals.gain)}
              helper={formatPercent(totals.gainPercent) + " sobre o custo"}
              icon={TrendingUp}
              tone={totals.gain >= 0 ? "profit" : "loss"}
            />
            <StatCard
              label="DY médio ponderado"
              value={
                totals.averageDY !== null
                  ? formatPercentPlain(totals.averageDY)
                  : "—"
              }
              helper="Dividend yield 12m da carteira"
              icon={Percent}
            />
            <StatCard
              label="Posições"
              value={String(positions.length)}
              helper={`${allocation.length} classes de ativos`}
              icon={PiggyBank}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alocação por classe</CardTitle>
                <CardDescription>
                  Distribuição do patrimônio a valor de mercado
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AllocationDonut data={allocation} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução patrimonial</CardTitle>
                <CardDescription>
                  Patrimônio vs. capital aportado — últimos 12 meses (simulado a
                  partir do custo médio)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EquityArea data={equityCurve} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Indicadores de volatilidade
              </CardTitle>
              <CardDescription>
                Volatilidade anualizada estimada por ativo — maiores exposições a
                risco da carteira
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VolatilityChart data={volatility} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Carteira unificada</CardTitle>
                <CardDescription>
                  {lastParseReport
                    ? `Fonte: ${lastParseReport.fileName} · ${lastParseReport.positionsParsed} posições reconhecidas` +
                      (lastParseReport.skippedRows > 0
                        ? ` · ${lastParseReport.skippedRows} linhas ignoradas`
                        : "")
                    : "Posições consolidadas"}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {lastParseReport && lastParseReport.warnings.length > 0 && (
                <div className="mb-4 space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                  {lastParseReport.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-amber-300/90">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
              <PortfolioTable positions={positions} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Substituir carteira</CardTitle>
              <CardDescription>
                Envie um novo arquivo para substituir as posições atuais.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileDropzone onParsed={handleParsed} onError={setParseError} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
