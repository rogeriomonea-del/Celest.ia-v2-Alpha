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
import type { VolatilityPoint } from "@/lib/types";
import { formatPercentPlain } from "@/lib/utils";
import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  ChartTooltipFrame,
} from "@/components/charts/chart-tooltip";

const VOLATILITY_HUE = "#4f46e5";

interface VolatilityChartProps {
  data: VolatilityPoint[];
}

interface VolatilityTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: VolatilityPoint }>;
}

function VolatilityTooltip({ active, payload }: VolatilityTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltipFrame
      title={point.ticker}
      rows={[
        {
          label: "Volatilidade anualizada",
          value: formatPercentPlain(point.volatility),
          color: VOLATILITY_HUE,
        },
      ]}
    />
  );
}

export function VolatilityChart({ data }: VolatilityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Sem dados de volatilidade para a carteira atual.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 32, bottom: 0, left: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} />
          <XAxis
            type="number"
            stroke="transparent"
            tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}%`}
            domain={[0, "dataMax + 4"]}
          />
          <YAxis
            type="category"
            dataKey="ticker"
            stroke="transparent"
            tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            content={<VolatilityTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar
            dataKey="volatility"
            fill={VOLATILITY_HUE}
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
