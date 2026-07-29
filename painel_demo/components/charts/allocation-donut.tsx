"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AllocationSlice } from "@/lib/types";
import { formatBRL, formatPercentPlain } from "@/lib/utils";
import {
  CHART_COLORS,
  CHART_SURFACE,
  ChartTooltipFrame,
} from "@/components/charts/chart-tooltip";

interface AllocationDonutProps {
  data: AllocationSlice[];
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: AllocationSlice & { fill: string };
  }>;
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0].payload;
  return (
    <ChartTooltipFrame
      title={slice.assetClass}
      rows={[
        { label: "Valor", value: formatBRL(slice.value), color: slice.fill },
        { label: "Participação", value: formatPercentPlain(slice.percent) },
      ]}
    />
  );
}

export function AllocationDonut({ data }: AllocationDonutProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Sem posições para exibir alocação.
      </div>
    );
  }

  const total = data.reduce((acc, slice) => acc + slice.value, 0);
  const chartData = data.map((slice, index) => ({
    ...slice,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="assetClass"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={2}
              strokeWidth={2}
              stroke={CHART_SURFACE}
            >
              {chartData.map((entry) => (
                <Cell key={entry.assetClass} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Total
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {formatBRL(total, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {chartData.map((slice) => (
          <li key={slice.assetClass} className="flex items-center gap-3 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: slice.fill }}
              aria-hidden
            />
            <span className="text-muted-foreground">{slice.assetClass}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatPercentPlain(slice.percent)}
            </span>
            <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
              {formatBRL(slice.value, { maximumFractionDigits: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
