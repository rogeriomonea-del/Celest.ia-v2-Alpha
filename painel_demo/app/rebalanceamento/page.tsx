"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Equal,
  Scale,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { allocationByClass, computeRebalance } from "@/lib/finance";
import type { AssetClass, RebalanceTarget } from "@/lib/types";
import {
  cn,
  formatBRL,
  formatPercentPlain,
  formatQuantity,
} from "@/lib/utils";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Mode = "class" | "asset";

interface TargetGroup {
  key: string;
  label: string;
  currentPercent: number;
}

function normalizeToHundred(groups: TargetGroup[]): Record<string, string> {
  const rounded = groups.map(
    (group) => Math.round(group.currentPercent * 10) / 10
  );
  const sum = rounded.reduce((acc, value) => acc + value, 0);
  const residual = Math.round((100 - sum) * 10) / 10;
  if (residual !== 0 && rounded.length > 0) {
    let largestIndex = 0;
    rounded.forEach((value, index) => {
      if (value > rounded[largestIndex]) largestIndex = index;
    });
    rounded[largestIndex] =
      Math.round((rounded[largestIndex] + residual) * 10) / 10;
  }
  const next: Record<string, string> = {};
  groups.forEach((group, index) => {
    next[group.key] = rounded[index].toFixed(1);
  });
  return next;
}

export default function RebalanceamentoPage() {
  const { positions, profile, hydrated } = useAppStore();
  const [mode, setMode] = useState<Mode>("class");
  const [targets, setTargets] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    if (mode === "class") {
      return allocationByClass(positions).map((slice) => ({
        key: slice.assetClass as string,
        label: slice.assetClass as string,
        currentPercent: slice.percent,
      }));
    }
    const total = positions.reduce((acc, p) => acc + p.marketValue, 0);
    return positions.map((p) => ({
      key: p.ticker,
      label: `${p.ticker}`,
      currentPercent: total > 0 ? (p.marketValue / total) * 100 : 0,
    }));
  }, [mode, positions]);

  useEffect(() => {
    setTargets((prev) => {
      const allFresh = groups.every((group) => prev[group.key] === undefined);
      if (allFresh && groups.length > 0) {
        return { ...prev, ...normalizeToHundred(groups) };
      }
      const next: Record<string, string> = {};
      for (const group of groups) {
        next[group.key] =
          prev[group.key] !== undefined
            ? prev[group.key]
            : group.currentPercent.toFixed(1);
      }
      return next;
    });
  }, [groups]);

  const parsedTargets: RebalanceTarget[] = useMemo(
    () =>
      groups.map((group) => ({
        key: group.key,
        targetPercent: Number(
          String(targets[group.key] ?? "0").replace(",", ".")
        ) || 0,
      })),
    [groups, targets]
  );

  const summary = useMemo(
    () => computeRebalance(positions, parsedTargets, mode),
    [positions, parsedTargets, mode]
  );

  const applyCurrentAllocation = () => {
    setTargets((prev) => ({ ...prev, ...normalizeToHundred(groups) }));
  };

  const applyEqualWeights = () => {
    if (groups.length === 0) return;
    const equal = 100 / groups.length;
    const next: Record<string, string> = {};
    groups.forEach((group, index) => {
      const isLast = index === groups.length - 1;
      next[group.key] = isLast
        ? (100 - equal * (groups.length - 1)).toFixed(1)
        : equal.toFixed(1);
    });
    setTargets(next);
  };

  const applyProfileAllocation = () => {
    if (!profile || mode !== "class") return;
    const presentClasses = groups.map((g) => g.key as AssetClass);
    const raw = presentClasses.map(
      (assetClass) => profile.recommendedAllocation[assetClass] ?? 0
    );
    const rawSum = raw.reduce((acc, v) => acc + v, 0);
    const next: Record<string, string> = {};
    if (rawSum <= 0) {
      presentClasses.forEach((assetClass) => {
        next[assetClass] = (100 / presentClasses.length).toFixed(1);
      });
    } else {
      let allocated = 0;
      presentClasses.forEach((assetClass, index) => {
        const isLast = index === presentClasses.length - 1;
        const normalized = isLast
          ? 100 - allocated
          : Math.round((raw[index] / rawSum) * 1000) / 10;
        allocated += normalized;
        next[assetClass] = normalized.toFixed(1);
      });
    }
    setTargets(next);
  };

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Scale className="h-6 w-6 text-primary" />
            Rebalanceamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Defina porcentagens alvo e receba o plano exato de compras e vendas.
          </p>
        </div>
        <Card className="max-w-xl">
          <CardContent className="space-y-4 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma carteira carregada. Importe seu extrato ou carregue a
              carteira exemplo no Dashboard para calcular o rebalanceamento.
            </p>
            <Button asChild>
              <Link href="/">Ir para o Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Scale className="h-6 w-6 text-primary" />
            Rebalanceamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare a alocação atual com a alvo e receba as ordens exatas de
            ajuste.
          </p>
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList>
            <TabsTrigger value="class">Por classe</TabsTrigger>
            <TabsTrigger value="asset">Por ativo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Porcentagens alvo</CardTitle>
            <CardDescription>
              A soma deve fechar em 100%. Atualmente:{" "}
              <span
                className={cn(
                  "font-medium tabular-nums",
                  summary.isValid ? "text-profit" : "text-amber-600"
                )}
              >
                {formatPercentPlain(summary.targetSum)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={applyCurrentAllocation}>
                <Equal className="h-3.5 w-3.5" />
                Alocação atual
              </Button>
              <Button variant="outline" size="sm" onClick={applyEqualWeights}>
                <Wand2 className="h-3.5 w-3.5" />
                Pesos iguais
              </Button>
              {mode === "class" && profile && (
                <Button variant="outline" size="sm" onClick={applyProfileAllocation}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Perfil {profile.profile}
                </Button>
              )}
            </div>

            <div className="space-y-2.5">
              {groups.map((group) => (
                <div
                  key={group.key}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{group.label}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      atual {formatPercentPlain(group.currentPercent)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      inputMode="decimal"
                      value={targets[group.key] ?? ""}
                      onChange={(event) =>
                        setTargets((prev) => ({
                          ...prev,
                          [group.key]: event.target.value,
                        }))
                      }
                      className="h-8 w-20 text-right tabular-nums"
                      aria-label={`Alvo para ${group.label}`}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>

            {!summary.isValid && (
              <p className="text-xs text-amber-300/90">
                Ajuste os alvos até somarem exatamente 100% para liberar o plano
                de rebalanceamento.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Patrimônio
                </p>
                <p className="pt-1.5 text-xl font-semibold tabular-nums">
                  {formatBRL(summary.totalValue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total a comprar
                </p>
                <p className="pt-1.5 text-xl font-semibold tabular-nums text-profit">
                  {summary.isValid ? formatBRL(summary.totalBuy) : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total a vender
                </p>
                <p className="pt-1.5 text-xl font-semibold tabular-nums text-loss">
                  {summary.isValid ? formatBRL(summary.totalSell) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano de ajuste</CardTitle>
              <CardDescription>
                {summary.isValid
                  ? `Desvio máximo atual de ${formatPercentPlain(summary.maxDeviation)} — ordens para atingir a alocação alvo`
                  : "Aguardando alvos válidos (soma = 100%)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{mode === "class" ? "Classe" : "Ativo"}</TableHead>
                    <TableHead className="text-right">Atual</TableHead>
                    <TableHead className="text-right">Alvo</TableHead>
                    <TableHead className="text-right">Desvio</TableHead>
                    <TableHead className="text-right">Ajuste (R$)</TableHead>
                    {mode === "asset" && (
                      <TableHead className="text-right">Qtde</TableHead>
                    )}
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.rows.map((row) => (
                    <TableRow
                      key={row.key}
                      className={cn(!summary.isValid && "opacity-40")}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{row.key}</span>
                          {mode === "asset" && (
                            <span className="text-xs text-muted-foreground">
                              {row.assetClass}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercentPlain(row.currentPercent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercentPlain(row.targetPercent)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          Math.abs(row.deviation) < 0.5
                            ? "text-muted-foreground"
                            : row.deviation > 0
                              ? "text-loss"
                              : "text-profit"
                        )}
                      >
                        {row.deviation > 0 ? "+" : ""}
                        {formatPercentPlain(row.deviation)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          row.action === "COMPRAR" && "text-profit",
                          row.action === "VENDER" && "text-loss",
                          row.action === "MANTER" && "text-muted-foreground"
                        )}
                      >
                        {row.action === "MANTER"
                          ? "—"
                          : formatBRL(Math.abs(row.deltaValue))}
                      </TableCell>
                      {mode === "asset" && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.units !== null && row.units > 0 && row.action !== "MANTER"
                            ? `${row.action === "COMPRAR" ? "+" : "-"}${formatQuantity(row.units)}`
                            : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {row.action === "COMPRAR" ? (
                          <Badge variant="default">
                            <ArrowUpRight className="mr-1 h-3 w-3" />
                            COMPRAR
                          </Badge>
                        ) : row.action === "VENDER" ? (
                          <Badge variant="destructive">
                            <ArrowDownRight className="mr-1 h-3 w-3" />
                            VENDER
                          </Badge>
                        ) : (
                          <Badge variant="muted">MANTER</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
