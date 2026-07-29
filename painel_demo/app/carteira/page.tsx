"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Database,
  FileUp,
  Gauge,
  PieChart,
  ShieldAlert,
} from "lucide-react";
import {
  formatBRL,
  formatNumber,
  formatPercentPlain,
  formatQuantity,
} from "@/lib/utils";
import {
  fetchPortfolioIssues,
  fetchSnapshotAnalysis,
  fetchSnapshots,
  fontesToList,
  type PolicyViolation,
  type PortfolioIssue,
  type SnapshotAnalysis,
  type SnapshotSummary,
  faixaToLabel,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  ConfidenceBadge,
  EmptyState,
  MetaFooter,
  NativeSelect,
  PageSkeleton,
  UnavailableValue,
  formatDateBR,
  formatDateTimeBR,
  humanizeKey,
} from "@/components/investment-os/shared";
import {
  WeightBars,
  WeightDonut,
  recordToWeights,
} from "@/components/investment-os/weight-charts";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatHHI(hhi: number | null): string {
  if (hhi === null) return "indisponível";
  return formatNumber(hhi, hhi <= 1 ? 3 : 0);
}

function ViolationCard({ violation }: { violation: PolicyViolation }) {
  const critical = violation.severidade === "critica";
  return (
    <div
      className={
        critical
          ? "rounded-xl border border-loss/40 bg-loss/10 p-4"
          : "rounded-xl border border-amber-300 bg-amber-50 p-4"
      }
      role={critical ? "alert" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={critical ? "destructive" : "warning"}>
          {critical ? "Crítica" : "Não crítica"}
        </Badge>
        <span className="text-sm font-medium">
          {humanizeKey(violation.tipo)} · {humanizeKey(violation.chave)}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Peso atual: {formatPercentPlain(violation.peso_pct)}
        {violation.limite_pct !== null && violation.limite_pct !== undefined
          ? ` · limite: ${formatPercentPlain(violation.limite_pct)}`
          : ""}
        {faixaToLabel(violation.faixa) ? ` · faixa: ${faixaToLabel(violation.faixa)}` : ""}
      </p>
    </div>
  );
}

function TickerChips({ tickers }: { tickers: string[] }) {
  if (tickers.length === 0) {
    return <span className="text-xs text-muted-foreground/70">nenhum</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {tickers.map((ticker) => (
        <Badge key={ticker} variant="muted" className="font-mono text-[11px]">
          {ticker}
        </Badge>
      ))}
    </span>
  );
}

export default function CarteiraPage() {
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<unknown>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<SnapshotAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<unknown>(null);
  const [issues, setIssues] = useState<PortfolioIssue[] | null>(null);
  const [analysisNonce, setAnalysisNonce] = useState(0);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    try {
      const list = await fetchSnapshots();
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSnapshots(sorted);
      setSelectedId((current) => current ?? sorted[0]?.id ?? null);
      try {
        setIssues(await fetchPortfolioIssues());
      } catch {
        setIssues(null); // ocorrências são complementares; não bloqueiam a tela
      }
    } catch (error) {
      setFatalError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    fetchSnapshotAnalysis(selectedId)
      .then((data) => {
        if (!cancelled) setAnalysis(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setAnalysis(null);
          setAnalysisError(error);
        }
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, analysisNonce]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedId) ?? null,
    [snapshots, selectedId]
  );

  const classeWeights = useMemo(
    () => recordToWeights(analysis?.pesos.por_classe, humanizeKey),
    [analysis]
  );

  if (loading) return <PageSkeleton />;

  if (fatalError) {
    return (
      <div className="space-y-6">
        <ApiPageHeader
          icon={Briefcase}
          title="Carteira"
          description="Visão consolidada do snapshot importado, com pesos, violações da IPS e qualidade dos dados."
        />
        <ApiErrorState error={fatalError} onRetry={() => void loadSnapshots()} />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6">
        <ApiPageHeader
          icon={Briefcase}
          title="Carteira"
          description="Visão consolidada do snapshot importado, com pesos, violações da IPS e qualidade dos dados."
        />
        <EmptyState
          icon={FileUp}
          title="Nenhum snapshot de carteira"
          description="Importe o extrato da B3 para criar o primeiro snapshot versionado da sua carteira."
        >
          <Button asChild>
            <Link href="/importacao">
              Ir para Importação B3
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const qualidade = analysis?.qualidade_dados ?? null;

  return (
    <div className="space-y-6">
      <ApiPageHeader
        icon={Briefcase}
        title="Carteira"
        description="Visão consolidada do snapshot importado, com pesos, violações da IPS e qualidade dos dados."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm space-y-1.5">
          <Label htmlFor="snapshot-select">Snapshot da carteira</Label>
          <NativeSelect
            id="snapshot-select"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                v{snapshot.version} · data-base {formatDateBR(snapshot.data_base)}{" "}
                · criado em {formatDateTimeBR(snapshot.created_at)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {analysis && <ConfidenceBadge value={analysis.confianca} />}
      </div>

      {analysisLoading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
          <span className="sr-only">Carregando análise do snapshot…</span>
        </div>
      )}

      {analysisError !== null && !analysisLoading ? (
        <ApiErrorState
          error={analysisError}
          onRetry={() => setAnalysisNonce((nonce) => nonce + 1)}
        />
      ) : null}

      {analysis && !analysisLoading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Patrimônio precificado"
              value={
                analysis.patrimonio_precificado_brl !== null
                  ? formatBRL(analysis.patrimonio_precificado_brl)
                  : "indisponível"
              }
              helper={analysis.nota_patrimonio}
              icon={Briefcase}
            />
            <StatCard
              label="Cobertura de preços"
              value={
                qualidade
                  ? formatPercentPlain(qualidade.cobertura_pct)
                  : "indisponível"
              }
              helper={
                qualidade
                  ? `${qualidade.posicoes_precificadas} de ${qualidade.posicoes_total} posições precificadas`
                  : undefined
              }
              icon={Gauge}
            />
            <StatCard
              label="Maior posição"
              value={
                analysis.concentracao.maior_posicao_pct !== null
                  ? formatPercentPlain(analysis.concentracao.maior_posicao_pct)
                  : "indisponível"
              }
              helper="Concentração por ativo"
              icon={PieChart}
            />
            <StatCard
              label="HHI (concentração)"
              value={formatHHI(analysis.concentracao.hhi)}
              helper="Índice Herfindahl-Hirschman informado pelo backend"
              icon={Database}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alocação</CardTitle>
              <CardDescription>
                Pesos calculados pelo motor determinístico do backend sobre as
                posições precificadas. {analysis.nota_patrimonio}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="classe">
                <TabsList aria-label="Dimensão da alocação">
                  <TabsTrigger value="classe">Classe</TabsTrigger>
                  <TabsTrigger value="setor">Setor</TabsTrigger>
                  <TabsTrigger value="moeda">Moeda</TabsTrigger>
                  <TabsTrigger value="pais">País</TabsTrigger>
                  <TabsTrigger value="emissor">Emissor</TabsTrigger>
                </TabsList>
                <TabsContent value="classe" className="pt-5">
                  <WeightDonut
                    entries={classeWeights}
                    totalBrl={analysis.patrimonio_precificado_brl}
                  />
                </TabsContent>
                <TabsContent value="setor" className="pt-5">
                  <WeightBars
                    entries={recordToWeights(analysis.pesos.por_setor, humanizeKey)}
                  />
                </TabsContent>
                <TabsContent value="moeda" className="pt-5">
                  <WeightBars entries={recordToWeights(analysis.pesos.por_moeda)} />
                </TabsContent>
                <TabsContent value="pais" className="pt-5">
                  <WeightBars
                    entries={recordToWeights(analysis.pesos.por_pais, humanizeKey)}
                  />
                </TabsContent>
                <TabsContent value="emissor" className="pt-5">
                  <WeightBars
                    entries={recordToWeights(analysis.pesos.por_emissor)}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Posições</CardTitle>
              <CardDescription>
                Preços da B3 com data do pregão (não ajustados por proventos —
                não representam retorno total). Custos ausentes aparecem como
                desconhecido, nunca como zero.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.posicoes.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  O snapshot não possui posições.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Ticker</TableHead>
                      <TableHead scope="col">Classe</TableHead>
                      <TableHead scope="col">Setor</TableHead>
                      <TableHead scope="col" className="text-right">
                        Quantidade
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Custo médio
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Preço (data do pregão)
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Valor de mercado
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Peso
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.posicoes.map((position, positionIndex) => (
                      <TableRow key={`${position.ticker}-${positionIndex}`}>
                        <TableCell className="font-medium">
                          {position.ticker}
                          {position.natureza && (
                            <span className="block text-[11px] text-muted-foreground/70">
                              {humanizeKey(position.natureza)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {humanizeKey(position.asset_class)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {position.setor ?? <UnavailableValue label="—" />}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(position.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {position.cost_status === "desconhecido" ||
                          position.avg_cost === null ? (
                            <UnavailableValue label="desconhecido" />
                          ) : (
                            formatBRL(position.avg_cost)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {position.price !== null &&
                          position.price !== undefined ? (
                            <>
                              {formatBRL(position.price)}
                              <span className="block text-[11px] text-muted-foreground/70">
                                pregão de {formatDateBR(position.price_date)}
                                {typeof position.price_staleness_days ===
                                  "number" &&
                                  position.price_staleness_days > 7 && (
                                    <Badge
                                      variant="warning"
                                      className="ml-1.5 px-1.5 py-0 text-[10px]"
                                    >
                                      stale {position.price_staleness_days}d
                                    </Badge>
                                  )}
                              </span>
                            </>
                          ) : (
                            <>
                              <UnavailableValue />
                              <span className="block text-[11px] text-muted-foreground/60">
                                {humanizeKey(position.price_status)}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {position.market_value !== null ? (
                            formatBRL(position.market_value)
                          ) : (
                            <UnavailableValue />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {position.weight_pct !== null &&
                          position.weight_pct !== undefined ? (
                            formatPercentPlain(position.weight_pct)
                          ) : (
                            <UnavailableValue label="—" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4 text-primary" aria-hidden />
                  Violações da IPS
                </CardTitle>
                <CardDescription>
                  Desvios em relação à política confirmada, apontados pelo
                  backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.violacoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma violação da IPS detectada neste snapshot.
                  </p>
                ) : (
                  [...analysis.violacoes]
                    .sort((a, b) =>
                      a.severidade === b.severidade
                        ? 0
                        : a.severidade === "critica"
                          ? -1
                          : 1
                    )
                    .map((violation, index) => (
                      <ViolationCard
                        key={`${violation.tipo}-${violation.chave}-${index}`}
                        violation={violation}
                      />
                    ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden />
                  Qualidade dos dados
                </CardTitle>
                <CardDescription>
                  Cobertura de precificação e pendências que reduzem a
                  confiança da análise.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {qualidade ? (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Cobertura de preços
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatPercentPlain(qualidade.cobertura_pct)}
                        </span>
                      </div>
                      <Progress value={qualidade.cobertura_pct} />
                      <p className="text-xs text-muted-foreground/70">
                        {qualidade.posicoes_precificadas} de{" "}
                        {qualidade.posicoes_total} posições com preço oficial.
                      </p>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div className="space-y-1">
                        <dt className="text-muted-foreground">Sem preço</dt>
                        <dd>
                          <TickerChips tickers={qualidade.sem_preco} />
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-muted-foreground">
                          Custo desconhecido
                        </dt>
                        <dd>
                          <TickerChips tickers={qualidade.custo_desconhecido} />
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-muted-foreground">
                          Preços defasados (&gt; 7 dias)
                        </dt>
                        <dd>
                          <TickerChips tickers={qualidade.precos_stale_7d} />
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Qualidade de dados não informada pela API.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-primary" aria-hidden />
                Ocorrências do portfólio
              </CardTitle>
              <CardDescription>
                Registro de problemas detectados pelo backend durante ingestão
                e análise.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {issues === null ? (
                <p className="text-sm text-muted-foreground">
                  Não foi possível carregar as ocorrências da API.
                </p>
              ) : issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma ocorrência registrada.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Quando</TableHead>
                      <TableHead scope="col">Escopo</TableHead>
                      <TableHead scope="col">Severidade</TableHead>
                      <TableHead scope="col">Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.map((issue) => (
                      <TableRow key={issue.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTimeBR(issue.created_at)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {humanizeKey(issue.scope)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              issue.severity.toLowerCase().includes("crit")
                                ? "destructive"
                                : "warning"
                            }
                          >
                            {humanizeKey(issue.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {issue.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <MetaFooter
            fontes={
              fontesToList(analysis.fontes).length > 0
                ? fontesToList(analysis.fontes)
                : ["não informadas pela API"]
            }
            entries={[
              {
                label: "Data-base da carteira",
                value: formatDateBR(analysis.data_base_carteira),
              },
              {
                label: "Data da análise",
                value: formatDateTimeBR(analysis.data_analise),
              },
              ...(selectedSnapshot
                ? [
                    {
                      label: "Snapshot",
                      value: `v${selectedSnapshot.version}`,
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </div>
  );
}
