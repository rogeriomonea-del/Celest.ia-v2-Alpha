"use client";

import type { ReactNode } from "react";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function ChartTooltipFrame({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-popover px-3 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm">
            {row.color && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
            )}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums text-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {footer && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

export const CHART_COLORS = [
  "#3b82f6",
  "#d97706",
  "#8b5cf6",
  "#0891b2",
  "#f43f5e",
  "#059669",
] as const;

export const CHART_GRID_COLOR = "rgba(255,255,255,0.06)";
export const CHART_AXIS_COLOR = "#71717a";
export const CHART_SURFACE = "#121214";
export const PROFIT_COLOR = "#10b981";
export const PROFIT_SERIES_COLOR = "#059669";
export const LOSS_COLOR = "#f43f5e";
export const NEUTRAL_SERIES_COLOR = "#71717a";
