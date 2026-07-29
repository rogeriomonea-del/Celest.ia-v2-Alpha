"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/types";
import { formatBRL, formatCompactBRL } from "@/lib/utils";
import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  ChartTooltipFrame,
  NEUTRAL_SERIES_COLOR,
  PROFIT_COLOR,
} from "@/components/charts/chart-tooltip";

interface EquityAreaProps {
  data: EquityPoint[];
}

interface EquityTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number }>;
}

function EquityTooltip({ active, label, payload }: EquityTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const marketValue = payload.find((p) => p.dataKey === "marketValue")?.value ?? 0;
  const invested = payload.find((p) => p.dataKey === "invested")?.value ?? 0;
  const diff = marketValue - invested;
  return (
    <ChartTooltipFrame
      title={label ?? ""}
      rows={[
        { label: "Patrimônio", value: formatBRL(marketValue), color: PROFIT_COLOR },
        { label: "Aportado", value: formatBRL(invested), color: NEUTRAL_SERIES_COLOR },
      ]}
      footer={
        <span className={diff >= 0 ? "text-profit" : "text-loss"}>
          {diff >= 0 ? "Ganho" : "Perda"}: {formatBRL(Math.abs(diff))}
        </span>
      }
    />
  );
}

export function EquityArea({ data }: EquityAreaProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Importe uma carteira para visualizar a evolução patrimonial.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: PROFIT_COLOR }}
            aria-hidden
          />
          Patrimônio
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-0.5 w-3.5 rounded-full"
            style={{ backgroundColor: NEUTRAL_SERIES_COLOR }}
            aria-hidden
          />
          Aportado
        </span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PROFIT_COLOR} stopOpacity={0.28} />
                <stop offset="100%" stopColor={PROFIT_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="transparent"
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
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
              content={<EquityTooltip />}
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="invested"
              stroke={NEUTRAL_SERIES_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              fill="transparent"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
            />
            <Area
              type="monotone"
              dataKey="marketValue"
              stroke={PROFIT_COLOR}
              strokeWidth={2}
              fill="url(#equityFill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
