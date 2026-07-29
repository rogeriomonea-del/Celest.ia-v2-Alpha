import type {
  AllocationSlice,
  AssetClass,
  CashflowTransaction,
  EquityPoint,
  MonthlyCashflowPoint,
  PortfolioPosition,
  RebalanceRow,
  RebalanceSummary,
  RebalanceTarget,
  VolatilityPoint,
} from "@/lib/types";
import { ASSET_CLASSES } from "@/lib/types";

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export function portfolioTotals(positions: PortfolioPosition[]): {
  invested: number;
  marketValue: number;
  gain: number;
  gainPercent: number;
  averageDY: number | null;
} {
  const invested = positions.reduce((acc, p) => acc + p.investedValue, 0);
  const marketValue = positions.reduce((acc, p) => acc + p.marketValue, 0);
  const gain = marketValue - invested;
  const gainPercent = invested > 0 ? (gain / invested) * 100 : 0;

  const withDY = positions.filter(
    (p) => p.dividendYield !== null && p.marketValue > 0
  );
  const dyWeight = withDY.reduce((acc, p) => acc + p.marketValue, 0);
  const averageDY =
    dyWeight > 0
      ? withDY.reduce(
          (acc, p) => acc + (p.dividendYield ?? 0) * (p.marketValue / dyWeight),
          0
        )
      : null;

  return { invested, marketValue, gain, gainPercent, averageDY };
}

export function allocationByClass(
  positions: PortfolioPosition[]
): AllocationSlice[] {
  const total = positions.reduce((acc, p) => acc + p.marketValue, 0);
  if (total <= 0) return [];

  const byClass = new Map<AssetClass, number>();
  for (const position of positions) {
    byClass.set(
      position.assetClass,
      (byClass.get(position.assetClass) ?? 0) + position.marketValue
    );
  }

  return ASSET_CLASSES.filter((assetClass) => byClass.has(assetClass)).map(
    (assetClass) => {
      const value = byClass.get(assetClass) ?? 0;
      return {
        assetClass,
        value,
        percent: (value / total) * 100,
      };
    }
  );
}

export function volatilitySeries(
  positions: PortfolioPosition[]
): VolatilityPoint[] {
  return positions
    .filter((p) => p.volatility !== null && p.volatility > 0)
    .map((p) => ({ ticker: p.ticker, volatility: p.volatility ?? 0 }))
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 8);
}

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function buildEquityCurve(
  positions: PortfolioPosition[],
  months = 12
): EquityPoint[] {
  const { invested, marketValue } = portfolioTotals(positions);
  if (invested <= 0 && marketValue <= 0) return [];

  const now = new Date();
  const points: EquityPoint[] = [];
  const startInvested = invested * 0.55;

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const progress = (months - 1 - i) / Math.max(months - 1, 1);
    const investedAt = startInvested + (invested - startInvested) * progress;
    const noise =
      i === 0 ? 0 : (seededNoise(date.getMonth() + date.getFullYear()) - 0.5) * 0.08;
    const performanceDrift =
      invested > 0 ? (marketValue / invested - 1) * progress : 0;
    const marketAt =
      i === 0 ? marketValue : investedAt * (1 + performanceDrift + noise);

    points.push({
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_LABELS[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`,
      invested: Math.round(investedAt),
      marketValue: Math.round(Math.max(marketAt, investedAt * 0.7)),
    });
  }

  return points;
}

export function computeRebalance(
  positions: PortfolioPosition[],
  targets: RebalanceTarget[],
  mode: "class" | "asset"
): RebalanceSummary {
  const totalValue = positions.reduce((acc, p) => acc + p.marketValue, 0);
  const targetMap = new Map(targets.map((t) => [t.key, t.targetPercent]));

  let groups: Array<{
    key: string;
    label: string;
    assetClass: AssetClass;
    currentValue: number;
    unitPrice: number | null;
  }>;

  if (mode === "class") {
    const byClass = new Map<AssetClass, number>();
    for (const p of positions) {
      byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + p.marketValue);
    }
    groups = Array.from(byClass.entries()).map(([assetClass, value]) => ({
      key: assetClass,
      label: assetClass,
      assetClass,
      currentValue: value,
      unitPrice: null,
    }));
  } else {
    groups = positions.map((p) => ({
      key: p.ticker,
      label: `${p.ticker} — ${p.name}`,
      assetClass: p.assetClass,
      currentValue: p.marketValue,
      unitPrice: p.currentPrice > 0 ? p.currentPrice : null,
    }));
  }

  const targetSum = groups.reduce(
    (acc, g) => acc + (targetMap.get(g.key) ?? 0),
    0
  );
  const isValid = Math.abs(targetSum - 100) < 0.05 && totalValue > 0;

  const rows: RebalanceRow[] = groups
    .map((group) => {
      const currentPercent =
        totalValue > 0 ? (group.currentValue / totalValue) * 100 : 0;
      const targetPercent = targetMap.get(group.key) ?? 0;
      const targetValue = (targetPercent / 100) * totalValue;
      const deltaValue = targetValue - group.currentValue;
      const deviation = currentPercent - targetPercent;

      const threshold = Math.max(totalValue * 0.001, 1);
      const action: RebalanceRow["action"] =
        deltaValue > threshold
          ? "COMPRAR"
          : deltaValue < -threshold
            ? "VENDER"
            : "MANTER";

      const units =
        group.unitPrice !== null && group.unitPrice > 0 && action !== "MANTER"
          ? Math.floor(Math.abs(deltaValue) / group.unitPrice)
          : null;

      return {
        key: group.key,
        label: group.label,
        assetClass: group.assetClass,
        currentValue: group.currentValue,
        currentPercent,
        targetPercent,
        targetValue,
        deviation,
        deltaValue,
        action,
        unitPrice: group.unitPrice,
        units,
      };
    })
    .sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue));

  const totalBuy = rows
    .filter((r) => r.action === "COMPRAR")
    .reduce((acc, r) => acc + r.deltaValue, 0);
  const totalSell = rows
    .filter((r) => r.action === "VENDER")
    .reduce((acc, r) => acc + Math.abs(r.deltaValue), 0);
  const maxDeviation = rows.reduce(
    (acc, r) => Math.max(acc, Math.abs(r.deviation)),
    0
  );

  return { rows, totalValue, totalBuy, totalSell, targetSum, isValid, maxDeviation };
}

export function monthlyCashflow(
  transactions: CashflowTransaction[],
  months = 6
): MonthlyCashflowPoint[] {
  const now = new Date();
  const points: MonthlyCashflowPoint[] = [];

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const monthTx = transactions.filter((t) => t.date.startsWith(key));
    const receitas = monthTx
      .filter((t) => t.type === "receita")
      .reduce((acc, t) => acc + t.amount, 0);
    const despesas = monthTx
      .filter((t) => t.type === "despesa")
      .reduce((acc, t) => acc + t.amount, 0);

    points.push({
      month: key,
      label: `${MONTH_LABELS[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`,
      receitas: Math.round(receitas * 100) / 100,
      despesas: Math.round(despesas * 100) / 100,
      saldo: Math.round((receitas - despesas) * 100) / 100,
    });
  }

  return points;
}

export function cashflowTotals(transactions: CashflowTransaction[]): {
  receitas: number;
  despesas: number;
  saldo: number;
  taxaPoupanca: number | null;
} {
  const receitas = transactions
    .filter((t) => t.type === "receita")
    .reduce((acc, t) => acc + t.amount, 0);
  const despesas = transactions
    .filter((t) => t.type === "despesa")
    .reduce((acc, t) => acc + t.amount, 0);
  const saldo = receitas - despesas;
  const taxaPoupanca = receitas > 0 ? (saldo / receitas) * 100 : null;
  return { receitas, despesas, saldo, taxaPoupanca };
}

export function expensesByCategory(
  transactions: CashflowTransaction[]
): Array<{ category: string; value: number; percent: number }> {
  const expenses = transactions.filter((t) => t.type === "despesa");
  const total = expenses.reduce((acc, t) => acc + t.amount, 0);
  if (total <= 0) return [];

  const byCategory = new Map<string, number>();
  for (const tx of expenses) {
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + tx.amount);
  }

  return Array.from(byCategory.entries())
    .map(([category, value]) => ({
      category,
      value,
      percent: (value / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);
}
