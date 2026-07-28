"use client";

/**
 * Visualizações de pesos (%) fornecidos pela API do backend.
 * Nenhum valor é calculado aqui além de produtos diretos peso × patrimônio
 * quando o patrimônio precificado é fornecido pela própria API.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL, formatPercentPlain } from "@/lib/utils";
import {
  CHART_COLORS,
  CHART_SURFACE,
  ChartTooltipFrame,
} from "@/components/charts/chart-tooltip";

export interface WeightEntry {
  label: string;
  pct: number;
}

export function recordToWeights(
  record: Record<string, number> | null | undefined,
  humanize?: (key: string) => string
): WeightEntry[] {
  if (!record) return [];
  return Object.entries(record)
    .map(([key, pct]) => ({
      label: humanize ? humanize(key) : key,
      pct: Number(pct),
    }))
    .filter((entry) => Number.isFinite(entry.pct))
    .sort((a, b) => b.pct - a.pct);
}

export function WeightBars({
  entries,
  emptyLabel = "Sem pesos informados pela API.",
}: {
  entries: WeightEntry[];
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {entries.map((entry, index) => (
        <li key={entry.label} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                }}
                aria-hidden
              />
              <span className="truncate text-muted-foreground">
                {entry.label}
              </span>
            </span>
            <span className="font-medium tabular-nums">
              {formatPercentPlain(entry.pct)}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="presentation"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(Math.max(entry.pct, 0), 100)}%`,
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface DonutDatum extends WeightEntry {
  fill: string;
}

function WeightDonutTooltip({
  active,
  payload,
  totalBrl,
}: {
  active?: boolean;
  payload?: Array<{ payload: DonutDatum }>;
  totalBrl: number | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  const rows = [
    {
      label: "Peso",
      value: formatPercentPlain(datum.pct),
      color: datum.fill,
    },
  ];
  if (totalBrl !== null) {
    rows.push({
      label: "Valor (peso × patrimônio)",
      value: formatBRL((datum.pct / 100) * totalBrl),
      color: datum.fill,
    });
  }
  return <ChartTooltipFrame title={datum.label} rows={rows} />;
}

export function WeightDonut({
  entries,
  totalBrl,
  centerLabel = "Patrimônio",
}: {
  entries: WeightEntry[];
  /** Patrimônio precificado informado pela API (ou null se indisponível). */
  totalBrl: number | null;
  centerLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Sem pesos informados pela API.
      </p>
    );
  }

  const data: DonutDatum[] = entries.map((entry, index) => ({
    ...entry,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="pct"
              nameKey="label"
              innerRadius={64}
              outerRadius={94}
              paddingAngle={2}
              strokeWidth={2}
              stroke={CHART_SURFACE}
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<WeightDonutTooltip totalBrl={totalBrl} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {centerLabel}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {totalBrl !== null ? (
              formatBRL(totalBrl, { maximumFractionDigits: 0 })
            ) : (
              <span className="italic font-normal text-muted-foreground">
                indisponível
              </span>
            )}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {data.map((entry) => (
          <li key={entry.label} className="flex items-center gap-3 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: entry.fill }}
              aria-hidden
            />
            <span className="min-w-0 truncate text-muted-foreground">
              {entry.label}
            </span>
            <span className="ml-auto font-medium tabular-nums">
              {formatPercentPlain(entry.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
