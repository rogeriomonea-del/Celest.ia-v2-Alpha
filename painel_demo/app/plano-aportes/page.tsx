"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Coins,
  FileUp,
  ListChecks,
  PiggyBank,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { formatBRL, formatPercentPlain } from "@/lib/utils";
import {
  fetchConfirmedPolicy,
  fetchSnapshotAnalysis,
  fetchSnapshots,
  isApiError,
  rebalanceSnapshot,
  type ConfirmedPolicy,
  type PolicyViolation,
  type RebalancePlan,
  type SnapshotAnalysis,
  type SnapshotSummary,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function MonthlyPlanTable({
  plan,
  caption,
}: {
  plan: Array<Record<string, number>>;
  caption: string;
}) {
  const keys = useMemo(() => {
    const set = new Set<string>();
    plan.forEach((month) => Object.keys(month).forEach((key) => set.add(key)));
    return Array.from(set);
  }, [plan]);

  if (plan.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        Plano não informado pela API.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Mês</TableHead>
          {keys.map((key) => (
            <TableHead key={key} scope="col" className="text-right">
              {humanizeKey(key)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {plan.map((month, index) => (
          <TableRow key={index}>
            <TableCell className="font-medium">Mês {index + 1}</TableCell>
            {keys.map((key) => (
              <TableCell key={key} className="text-right tabular-nums">
                {key in month ? (
                  formatBRL(month[key])
                ) : (
                  <UnavailableValue label="—" />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      <TableCaption className="sr-only">{caption}</TableCaption>
    </Table>
  );
}

function ViolationList({ violations }: { violations: PolicyViolation[] }) {
  if (!Array.isArray(violations) || violations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma violação remanescente após a simulação.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {violations.map((violation, index) => (
        <li
          key={`${violation.tipo}-${violation.chave}-${index}`}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm"
        >
          <Badge
            variant={
              violation.severidade === "critica" ? "destructive" : "warning"
            }
          >
            {violation.severidade === "critica" ? "Crítica" : "Não crítica"}
          </Badge>
          <span>
            {humanizeKey(violation.tipo)} · {humanizeKey(violation.chave)} ·{" "}
            {formatPercentPlain(violation.peso_pct)}
            {violation.limite_pct !== null && violation.limite_pct !== undefined
              ? ` (limite ${formatPercentPlain(violation.limite_pct)})`
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PlanoAportesPage() {
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<unknown>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [confirmedPolicy, setConfirmedPolicy] =
    useState<ConfirmedPolicy | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [monthsInput, setMonthsInput] = useState("");

  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [analysisBefore, setAnalysisBefore] = useState<SnapshotAnalysis | null>(
    null
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [policyNotConfirmed, setPolicyNotConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    try {
      const [snapshotList, policy] = await Promise.all([
        fetchSnapshots(),
        fetchConfirmedPolicy(),
      ]);
      const sorted = [...snapshotList].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSnapshots(sorted);
      setConfirmedPolicy(policy);
      setSelectedId((current) => current ?? sorted[0]?.id ?? null);
    } catch (error) {
      setFatalError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async () => {
    if (!selectedId) return;
    setGenerating(true);
    setGenerateError(null);
    setPolicyNotConfirmed(false);
    setPlan(null);
    try {
      const months = monthsInput.trim()
        ? Number.parseInt(monthsInput.trim(), 10)
        : undefined;
      const [planResult, analysisResult] = await Promise.all([
        rebalanceSnapshot(
          selectedId,
          months !== undefined && Number.isFinite(months) ? months : undefined
        ),
        fetchSnapshotAnalysis(selectedId).catch(() => null),
      ]);
      setPlan(planResult);
      setAnalysisBefore(analysisResult);
    } catch (error) {
      if (isApiError(error, "policy_not_confirmed")) {
        setPolicyNotConfirmed(true);
      } else {
        setGenerateError(error);
      }
    } finally {
      setGenerating(false);
    }
  }, [monthsInput, selectedId]);

  const pesosComparison = useMemo(() => {
    if (!plan) return [];
    const depois = plan.caminho_ate_faixas?.pesos_projetados_pct ?? {};
    const antes = analysisBefore?.pesos.por_classe ?? {};
    const keys = Array.from(
      new Set([...Object.keys(antes), ...Object.keys(depois)])
    );
    return keys.map((key) => ({
      key,
      antes: key in antes ? antes[key] : null,
      depois: key in depois ? depois[key] : null,
    }));
  }, [plan, analysisBefore]);

  if (loading) return <PageSkeleton />;

  if (fatalError) {
    return (
      <div className="space-y-6">
        <ApiPageHeader
          icon={CalendarClock}
          title="Plano de aportes"
          description="Rebalanceamento por aportes segundo a IPS confirmada — priorizando compras e evitando vendas."
        />
        <ApiErrorState error={fatalError} onRetry={() => void load()} />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6">
        <ApiPageHeader
          icon={CalendarClock}
          title="Plano de aportes"
          description="Rebalanceamento por aportes segundo a IPS confirmada — priorizando compras e evitando vendas."
        />
        <EmptyState
          icon={FileUp}
          title="Nenhum snapshot de carteira"
          description="O plano de aportes é calculado sobre um snapshot importado. Importe o extrato da B3 primeiro."
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

  return (
    <div className="space-y-6">
      <ApiPageHeader
        icon={CalendarClock}
        title="Plano de aportes"
        description="Rebalanceamento por aportes segundo a IPS confirmada — priorizando compras e evitando vendas."
      />

      {!confirmedPolicy && !policyNotConfirmed && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-300">
          Não há IPS confirmada no backend — a geração do plano será recusada
          até que uma versão seja confirmada em Política.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar plano</CardTitle>
          <CardDescription>
            O backend simula os próximos aportes e devolve o plano com
            premissas explícitas. Nada é calculado no frontend.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm space-y-1.5">
            <Label htmlFor="plan-snapshot">Snapshot da carteira</Label>
            <NativeSelect
              id="plan-snapshot"
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(Number(event.target.value))}
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  v{snapshot.version} · data-base{" "}
                  {formatDateBR(snapshot.data_base)} · criado em{" "}
                  {formatDateTimeBR(snapshot.created_at)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-40 space-y-1.5">
            <Label htmlFor="plan-months">Horizonte (meses)</Label>
            <Input
              id="plan-months"
              type="number"
              min={1}
              max={24}
              placeholder="padrão da API"
              value={monthsInput}
              onChange={(event) => setMonthsInput(event.target.value)}
            />
          </div>
          <Button onClick={() => void generate()} disabled={generating}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {generating ? "Gerando…" : "Gerar plano de aportes"}
          </Button>
        </CardContent>
      </Card>

      {generating && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <span className="sr-only">Gerando plano na API…</span>
        </div>
      )}

      {policyNotConfirmed && (
        <Card className="border-amber-300">
          <CardContent className="flex flex-col items-start gap-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 ring-1 ring-amber-300">
                <Scale className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="font-medium">IPS não confirmada</p>
                <p className="text-sm text-muted-foreground">
                  O backend recusou a geração do plano (código{" "}
                  <span className="font-mono">policy_not_confirmed</span>).
                  Nenhum aporte é recomendado sem uma Política de Investimentos
                  confirmada por você.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/politica">
                Ir para Perfil e Política
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {generateError !== null && !generating && (
        <ApiErrorState error={generateError} onRetry={() => void generate()} />
      )}

      {!plan && !generating && !policyNotConfirmed && generateError === null && (
        <p className="text-sm text-muted-foreground">
          Selecione o snapshot e gere o plano para ver o destino do próximo
          aporte, os planos de 3 e 6 meses e as ações priorizadas.
        </p>
      )}

      {plan && !generating && (
        <>
          {/* Premissas SEMPRE visíveis */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-primary" aria-hidden />
                Premissas do plano
              </CardTitle>
              <CardDescription>
                Todas as premissas informadas pelo backend para esta simulação
                — leia antes de seguir qualquer ação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plan.premissas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  A API não informou premissas para este plano.
                </p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {plan.premissas.map((premissa) => (
                    <li key={premissa}>{premissa}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Aporte mensal"
              value={formatBRL(plan.aporte_mensal_brl)}
              helper="Valor considerado na simulação"
              icon={PiggyBank}
            />
            <StatCard
              label="Vendas evitadas"
              value={formatBRL(plan.vendas_evitadas_brl)}
              helper="Rebalanceamento só com aportes"
              icon={Coins}
              tone="profit"
            />
            <StatCard
              label="Dentro das faixas após simulação"
              value={
                plan.caminho_ate_faixas?.dentro_das_faixas_apos_simulacao
                  ? "Sim"
                  : "Não"
              }
              helper="Projeção ao fim do horizonte simulado"
              icon={CheckCircle2}
              tone={
                plan.caminho_ate_faixas?.dentro_das_faixas_apos_simulacao
                  ? "profit"
                  : "loss"
              }
            />
            <Card>
              <CardContent className="flex h-full flex-col justify-center gap-2 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Confiança do plano
                </p>
                <ConfidenceBadge value={plan.confianca} />
                <p className="text-xs text-muted-foreground/70">
                  Plano <span className="font-mono">{plan.plan_id}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Destino do próximo aporte
                </CardTitle>
                <CardDescription>
                  Distribuição sugerida pelo backend para o primeiro aporte.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(plan.proximo_aporte).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem destino informado pela API.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Destino</TableHead>
                        <TableHead scope="col" className="text-right">
                          Valor
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(plan.proximo_aporte)
                        .sort(([, a], [, b]) => b - a)
                        .map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="font-medium">
                              {humanizeKey(key)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatBRL(value)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pesos por classe: atual × projetado
                </CardTitle>
                <CardDescription>
                  Atual = análise do snapshot; projetado = após a simulação de
                  aportes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pesosComparison.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Pesos projetados não informados pela API.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Classe</TableHead>
                        <TableHead scope="col" className="text-right">
                          Atual
                        </TableHead>
                        <TableHead scope="col" className="text-right">
                          Projetado
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pesosComparison.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">
                            {humanizeKey(row.key)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.antes !== null ? (
                              formatPercentPlain(row.antes)
                            ) : (
                              <UnavailableValue label="—" />
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.depois !== null ? (
                              formatPercentPlain(row.depois)
                            ) : (
                              <UnavailableValue label="—" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {!analysisBefore && (
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    Pesos atuais indisponíveis: a análise do snapshot não pôde
                    ser carregada.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano de 3 meses</CardTitle>
              <CardDescription>
                Valores por destino em cada mês, conforme simulado pelo
                backend.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyPlanTable
                plan={plan.plano_3_meses}
                caption="Plano de aportes para 3 meses"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano de 6 meses</CardTitle>
              <CardDescription>
                Extensão da simulação para 6 meses de aportes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyPlanTable
                plan={plan.plano_6_meses}
                caption="Plano de aportes para 6 meses"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ações priorizadas</CardTitle>
              <CardDescription>
                Ordem de execução sugerida, com justificativa e faixa-alvo da
                IPS para cada ação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plan.acoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma ação sugerida — a carteira já atende à IPS.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">#</TableHead>
                      <TableHead scope="col">Prioridade</TableHead>
                      <TableHead scope="col">Escopo</TableHead>
                      <TableHead scope="col">Alvo</TableHead>
                      <TableHead scope="col">Ação</TableHead>
                      <TableHead scope="col" className="text-right">
                        Valor
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Atual
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Faixa-alvo
                      </TableHead>
                      <TableHead scope="col">Justificativa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...plan.acoes]
                      .sort((a, b) => a.seq - b.seq)
                      .map((acao) => (
                        <TableRow key={acao.seq}>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {acao.seq}
                          </TableCell>
                          <TableCell>
                            <Badge variant="muted">
                              {String(acao.priority)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {humanizeKey(acao.scope)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {humanizeKey(acao.key)}
                          </TableCell>
                          <TableCell>{humanizeKey(acao.action)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {acao.amount_brl !== null ? (
                              formatBRL(acao.amount_brl)
                            ) : (
                              <UnavailableValue label="—" />
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {acao.current_pct !== null &&
                            acao.current_pct !== undefined ? (
                              formatPercentPlain(acao.current_pct)
                            ) : (
                              <UnavailableValue label="—" />
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {acao.target_min_pct !== null &&
                            acao.target_min_pct !== undefined &&
                            acao.target_max_pct !== null &&
                            acao.target_max_pct !== undefined ? (
                              `${formatPercentPlain(acao.target_min_pct)} – ${formatPercentPlain(acao.target_max_pct)}`
                            ) : (
                              <UnavailableValue label="—" />
                            )}
                          </TableCell>
                          <TableCell className="max-w-72 text-xs text-muted-foreground">
                            <span title={acao.rationale}>{acao.rationale}</span>
                            {acao.revisao && (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                                Revisão: {acao.revisao}
                              </span>
                            )}
                            {acao.custo_imposto && (
                              <span className="mt-0.5 block text-[11px] text-amber-600/90">
                                Custo/imposto: {acao.custo_imposto}
                              </span>
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
                  Violações remanescentes
                </CardTitle>
                <CardDescription>
                  O que ainda fica fora das faixas mesmo após o horizonte
                  simulado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ViolationList violations={plan.violacoes_remanescentes} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Situação antes da simulação
                </CardTitle>
                <CardDescription>
                  Concentração e exposição cambial de partida, conforme o
                  backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Maior posição (antes)
                  </span>
                  <span className="font-medium tabular-nums">
                    {plan.concentracao_antes?.maior_posicao_pct !== null &&
                    plan.concentracao_antes?.maior_posicao_pct !== undefined ? (
                      formatPercentPlain(
                        plan.concentracao_antes.maior_posicao_pct
                      )
                    ) : (
                      <UnavailableValue />
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">HHI (antes)</span>
                  <span className="font-medium tabular-nums">
                    {plan.concentracao_antes?.hhi !== null &&
                    plan.concentracao_antes?.hhi !== undefined ? (
                      String(plan.concentracao_antes.hhi)
                    ) : (
                      <UnavailableValue />
                    )}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-muted-foreground">
                    Exposição cambial (antes)
                  </span>
                  {plan.exposicao_cambial_antes === null ||
                  plan.exposicao_cambial_antes === undefined ? (
                    <p>
                      <UnavailableValue />
                    </p>
                  ) : typeof plan.exposicao_cambial_antes === "number" ? (
                    <p className="font-medium tabular-nums">
                      {formatPercentPlain(plan.exposicao_cambial_antes)}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {Object.entries(plan.exposicao_cambial_antes).map(
                        ([currency, pct]) => (
                          <li
                            key={currency}
                            className="flex items-center justify-between"
                          >
                            <span className="text-muted-foreground">
                              {currency}
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatPercentPlain(pct)}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  )}
                </div>
                {plan.qualidade_dados && (
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground/80">
                    Qualidade dos dados: cobertura de{" "}
                    {formatPercentPlain(plan.qualidade_dados.cobertura_pct)} (
                    {plan.qualidade_dados.posicoes_precificadas} de{" "}
                    {plan.qualidade_dados.posicoes_total} posições
                    precificadas).
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <MetaFooter
            fontes={[
              "Investment Intelligence OS — motor determinístico de rebalanceamento (API /v1)",
            ]}
            entries={[
              ...(analysisBefore
                ? [
                    {
                      label: "Data-base da carteira",
                      value: formatDateBR(analysisBefore.data_base_carteira),
                    },
                  ]
                : []),
              ...(confirmedPolicy
                ? [
                    {
                      label: "IPS vigente",
                      value: `v${confirmedPolicy.version} (confirmada em ${formatDateTimeBR(confirmedPolicy.confirmed_at)})`,
                    },
                  ]
                : []),
              { label: "Plano", value: String(plan.plan_id) },
            ]}
          />
        </>
      )}
    </div>
  );
}
