"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyCashflowPoint } from "@/lib/types";
import { formatBRL, formatCompactBRL } from "@/lib/utils";
import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  ChartTooltipFrame,
  LOSS_COLOR,
  PROFIT_SERIES_COLOR,
} from "@/components/charts/chart-tooltip";

interface CashflowChartProps {
  data: MonthlyCashflowPoint[];
}

interface CashflowTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number; payload: MonthlyCashflowPoint }>;
}

function CashflowTooltip({ active, label, payload }: CashflowTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltipFrame
      title={label ?? ""}
      rows={[
        { label: "Receitas", value: formatBRL(point.receitas), color: PROFIT_SERIES_COLOR },
        { label: "Despesas", value: formatBRL(point.despesas), color: LOSS_COLOR },
      ]}
      footer={
        <span className={point.saldo >= 0 ? "text-profit" : "text-loss"}>
          Saldo: {formatBRL(point.saldo)}
        </span>
      }
    />
  );
}

export function CashflowChart({ data }: CashflowChartProps) {
  const hasData = data.some((point) => point.receitas > 0 || point.despesas > 0);

  if (!hasData) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Adicione lançamentos ou conecte um banco via Open Finance.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: PROFIT_SERIES_COLOR }}
            aria-hidden
          />
          Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: LOSS_COLOR }}
            aria-hidden
          />
          Despesas
        </span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: 4 }}
            barCategoryGap="24%"
            barGap={2}
          >
            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="transparent"
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="transparent"
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatCompactBRL(value)}
              width={72}
            />
            <Tooltip
              content={<CashflowTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar
              dataKey="receitas"
              fill={PROFIT_SERIES_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="despesas"
              fill={LOSS_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
