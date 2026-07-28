"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { PortfolioPosition } from "@/lib/types";
import {
  cn,
  formatBRL,
  formatNumber,
  formatPercent,
  formatPercentPlain,
  formatQuantity,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PortfolioTableProps {
  positions: PortfolioPosition[];
}

const CLASS_BADGE_VARIANT: Record<string, "default" | "secondary" | "muted" | "warning" | "outline"> = {
  "Ações": "default",
  FIIs: "secondary",
  "Renda Fixa": "muted",
  ETFs: "outline",
  BDRs: "warning",
  Caixa: "muted",
};

export function PortfolioTable({ positions }: PortfolioTableProps) {
  if (positions.length === 0) return null;

  const totalInvested = positions.reduce((acc, p) => acc + p.investedValue, 0);
  const totalMarket = positions.reduce((acc, p) => acc + p.marketValue, 0);
  const totalGain = totalMarket - totalInvested;
  const totalGainPercent =
    totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Ativo</TableHead>
          <TableHead>Classe</TableHead>
          <TableHead className="text-right">Qtde</TableHead>
          <TableHead className="text-right">Preço médio</TableHead>
          <TableHead className="text-right">Cotação</TableHead>
          <TableHead className="text-right">Posição</TableHead>
          <TableHead className="text-right">Ganho/Perda</TableHead>
          <TableHead className="text-right">DY</TableHead>
          <TableHead className="text-right">P/L</TableHead>
          <TableHead className="text-right">P/VP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((position) => {
          const isProfit = position.gain >= 0;
          return (
            <TableRow key={position.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{position.ticker}</span>
                  <span className="max-w-[180px] truncate text-xs text-muted-foreground">
                    {position.name}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={CLASS_BADGE_VARIANT[position.assetClass] ?? "muted"}
                >
                  {position.assetClass}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(position.quantity)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBRL(position.averagePrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBRL(position.currentPrice)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatBRL(position.marketValue)}
              </TableCell>
              <TableCell className="text-right">
                <div
                  className={cn(
                    "flex items-center justify-end gap-1.5 tabular-nums",
                    isProfit ? "text-profit" : "text-loss"
                  )}
                >
                  {isProfit ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  <span className="flex flex-col items-end leading-tight">
                    <span>{formatBRL(position.gain)}</span>
                    <span className="text-[11px] opacity-80">
                      {formatPercent(position.gainPercent)}
                    </span>
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {position.dividendYield !== null
                  ? formatPercentPlain(position.dividendYield)
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {position.priceEarnings !== null
                  ? formatNumber(position.priceEarnings, 1)
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {position.priceToBook !== null
                  ? formatNumber(position.priceToBook, 2)
                  : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="text-sm text-muted-foreground">
            {positions.length} posições · aportado {formatBRL(totalInvested)}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatBRL(totalMarket)}
          </TableCell>
          <TableCell
            className={cn(
              "text-right font-semibold tabular-nums",
              totalGain >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatBRL(totalGain)}
            <span className="ml-1 text-[11px] opacity-80">
              ({formatPercent(totalGainPercent)})
            </span>
          </TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
