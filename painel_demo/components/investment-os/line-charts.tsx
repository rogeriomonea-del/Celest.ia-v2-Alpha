"use client";

/**
 * Gráficos de linha das telas da Fase 6 (macro e Tesouro Direto).
 * Nada aqui calcula indicadores: os componentes apenas plotam pontos
 * fornecidos pela API do backend, com data e unidade explícitas.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CurvaPonto, SeriePonto } from "@/lib/api/investment-os";
import { formatNumber } from "@/lib/utils";
import { formatDateBR } from "@/components/investment-os/shared";
import {
  CHART_AXIS_COLOR,
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_SURFACE,
  ChartTooltipFrame,
} from "@/components/charts/chart-tooltip";

function monthYearTick(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  return match ? `${match[2]}/${match[1].slice(2)}` : iso;
}

function yearTick(iso: string): string {
  const match = /^(\d{4})/.exec(iso);
  return match ? match[1] : iso;
}

// ---------------------------------------------------------------------------
// Série temporal simples (macro): pontos {data, valor} + unidade
// ---------------------------------------------------------------------------

interface SeriesTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ value: number }>;
  unit: string;
  color: string;
  digits: number;
}

function SeriesTooltip({
  active,
  label,
  payload,
  unit,
  color,
  digits,
}: SeriesTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <ChartTooltipFrame
      title={formatDateBR(label)}
      rows={[
        {
          label: unit,
          value: formatNumber(payload[0].value, digits),
          color,
        },
      ]}
    />
  );
}

export function SeriesLineChart({
  points,
  unit,
  color = CHART_COLORS[0],
  digits = 2,
  height = 208,
}: {
  points: SeriePonto[];
  /** Unidade informada pela documentação da série (ex.: "% a.a."). */
  unit: string;
  color?: string;
  digits?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Série sem pontos informados pela API.
      </p>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="data"
            stroke="transparent"
            tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tickFormatter={monthYearTick}
          />
          <YAxis
            stroke="transparent"
            tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(value: number) => formatNumber(value, digits)}
          />
          <Tooltip
            content={
              <SeriesTooltip unit={unit} color={color} digits={digits} />
            }
            cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_SURFACE }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Curva de juros (Tesouro): pontos {vencimento, taxa_pct, tipo}
// — uma linha por tipo de título, eixo X por vencimento
// ---------------------------------------------------------------------------

interface CurveRow {
  vencimento: string;
  [tipo: string]: string | number | null;
}

interface CurveTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number; stroke?: string }>;
}

function CurveTooltip({ active, label, payload }: CurveTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <ChartTooltipFrame
      title={`Vencimento ${formatDateBR(label)}`}
      rows={payload
        .filter((entry) => typeof entry.value === "number")
        .map((entry) => ({
          label: String(entry.dataKey),
          value: `${formatNumber(entry.value, 2)}% a.a.`,
          color: entry.stroke,
        }))}
    />
  );
}

export function YieldCurveChart({
  points,
  height = 256,
}: {
  points: CurvaPonto[];
  height?: number;
}) {
  const { rows, tipos } = useMemo(() => {
    const tiposUnicos = Array.from(new Set(points.map((p) => p.tipo))).sort();
    const byVencimento = new Map<string, CurveRow>();
    for (const point of points) {
      const row =
        byVencimento.get(point.vencimento) ??
        ({ vencimento: point.vencimento } as CurveRow);
      row[point.tipo] = point.taxa_pct;
      byVencimento.set(point.vencimento, row);
    }
    const ordered = Array.from(byVencimento.values()).sort((a, b) =>
      a.vencimento.localeCompare(b.vencimento)
    );
    return { rows: ordered, tipos: tiposUnicos };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Curva sem pontos informados pela API.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {tipos.map((tipo, index) => (
          <span key={tipo} className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-3.5 rounded-full"
              style={{
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
              aria-hidden
            />
            {tipo}
          </span>
        ))}
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="vencimento"
              stroke="transparent"
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yearTick}
            />
            <YAxis
              stroke="transparent"
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => `${formatNumber(value, 1)}%`}
            />
            <Tooltip
              content={<CurveTooltip />}
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
            />
            {tipos.map((tipo, index) => (
              <Line
                key={tipo}
                type="monotone"
                dataKey={tipo}
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={2}
                connectNulls
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_SURFACE }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
