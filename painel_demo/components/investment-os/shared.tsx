"use client";

/**
 * Blocos compartilhados das telas conectadas à API real do Investment
 * Intelligence OS (/politica, /importacao, /carteira, /plano-aportes).
 * Nada aqui calcula indicadores — apenas exibe o que a API fornece.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, PlugZap, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BACKEND_START_COMMAND,
  IIOS_API_URL,
  IIOS_DEMO,
  errorMessage,
  isApiError,
  isUnreachableError,
} from "@/lib/api/investment-os";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Formatadores (pt-BR) — datas e valores com status
// ---------------------------------------------------------------------------

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "indisponível";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("pt-BR");
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "indisponível";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return formatDateBR(iso);
  return parsed.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Transforma chaves técnicas (`renda_fixa`) em rótulo legível (`Renda fixa`). */
export function humanizeKey(key: string): string {
  const cleaned = key.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ---------------------------------------------------------------------------
// Valores ausentes: nunca 0, sempre status explícito
// ---------------------------------------------------------------------------

export function UnavailableValue({
  label = "indisponível",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("italic text-muted-foreground/80", className)}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Selo de origem dos dados: API real vs modo demonstração
// ---------------------------------------------------------------------------

function SourceBadge({ onGradient = false }: { onGradient?: boolean }) {
  if (IIOS_DEMO) {
    return (
      <Badge
        variant="warning"
        title="Modo demonstração: dados ilustrativos congelados — NÃO são dados reais"
      >
        DEMONSTRAÇÃO
      </Badge>
    );
  }
  return (
    <Badge
      className={
        onGradient
          ? "border-transparent bg-white/15 text-white ring-1 ring-white/25"
          : undefined
      }
      title="Dados reais servidos pela API do backend Investment Intelligence OS"
    >
      API
    </Badge>
  );
}

function SourceNote({ className }: { className?: string }) {
  if (IIOS_DEMO) {
    return (
      <p className={className}>
        MODO DEMONSTRAÇÃO: dados ilustrativos congelados — NÃO são dados
        reais nem provêm de fontes oficiais (CVM, B3, Tesouro, BCB). Para
        dados reais, rode o backend e desative{" "}
        <span className="font-mono">NEXT_PUBLIC_IIOS_DEMO</span>.
      </p>
    );
  }
  return (
    <p className={className}>
      Fonte dos dados: API do backend Investment Intelligence OS em{" "}
      <span className="font-mono">{IIOS_API_URL}</span> — nenhum dado é
      simulado nesta tela.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Hero em gradiente (design Celestia Flights) — usado na visão geral
// ---------------------------------------------------------------------------

export function PageHero({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 px-6 py-10 text-white shadow-lg animate-fade-in-up sm:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
      </div>
      <div className="relative max-w-3xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <SourceBadge onGradient />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="text-sm leading-relaxed text-indigo-100 sm:text-base">
          {description}
        </p>
        <SourceNote className="text-xs text-indigo-200/90" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho de página com selo API
// ---------------------------------------------------------------------------

export function ApiPageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
        <Icon className="h-6 w-6 text-primary" aria-hidden />
        {title}
        <SourceBadge />
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <SourceNote className="text-xs text-muted-foreground/70" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados: erro de API, vazio
// ---------------------------------------------------------------------------

export function ApiErrorState({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const unreachable = isUnreachableError(error);
  const apiError = isApiError(error) ? error : null;

  return (
    <Card role="alert" className="border-loss/30">
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-loss/10 text-loss ring-1 ring-loss/20">
            {unreachable ? (
              <PlugZap className="h-5 w-5" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5" aria-hidden />
            )}
          </div>
          <div>
            <p className="font-medium">
              {title ??
                (unreachable
                  ? "API do backend indisponível"
                  : "Erro ao consultar a API do backend")}
            </p>
            <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
            {apiError && (
              <p className="mt-1 text-xs text-muted-foreground/70">
                Código: <span className="font-mono">{apiError.code}</span> · HTTP{" "}
                {apiError.status}
              </p>
            )}
          </div>
        </div>

        {unreachable && (
          <div className="w-full rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <p className="text-muted-foreground">
              Inicie o backend no repositório{" "}
              <span className="font-mono">Celest.ia-v2-Alpha</span>:
            </p>
            <code className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
              {BACKEND_START_COMMAND}
            </code>
            <p className="mt-1 text-xs text-muted-foreground/70">
              URL configurada:{" "}
              <span className="font-mono">{IIOS_API_URL}</span> (variável{" "}
              <span className="font-mono">NEXT_PUBLIC_IIOS_API_URL</span>).
            </p>
          </div>
        )}

        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Tentar novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-muted-foreground ring-1 ring-slate-200">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <p className="font-medium">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Confiança e severidade
// ---------------------------------------------------------------------------

export function ConfidenceBadge({ value }: { value: string | null | undefined }) {
  const normalized = (value ?? "").toUpperCase();
  const variant =
    normalized === "ALTA"
      ? ("default" as const)
      : normalized === "MEDIA" || normalized === "MÉDIA"
        ? ("warning" as const)
        : normalized === "BAIXA"
          ? ("destructive" as const)
          : ("muted" as const);
  return (
    <Badge variant={variant} aria-label={`Confiança: ${normalized || "indisponível"}`}>
      Confiança: {normalized || "indisponível"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Rodapé de metadados: fonte + data-base sempre visíveis
// ---------------------------------------------------------------------------

export interface MetaEntry {
  label: string;
  value: string;
}

export function MetaFooter({
  fontes,
  entries,
  className,
}: {
  fontes?: string[];
  entries?: MetaEntry[];
  className?: string;
}) {
  const fonteText =
    fontes && fontes.length > 0 ? fontes.join(" · ") : "indisponível";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground",
        className
      )}
    >
      <span>
        <span className="font-medium text-foreground/80">
          {fontes && fontes.length > 1 ? "Fontes" : "Fonte"}:
        </span>{" "}
        {fonteText}
      </span>
      {(entries ?? []).map((entry) => (
        <span key={entry.label}>
          <span className="font-medium text-foreground/80">{entry.label}:</span>{" "}
          {entry.value}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select nativo estilizado (sem dependência nova)
// ---------------------------------------------------------------------------

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full appearance-none rounded-xl border border-border bg-surface-raised px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.6rem center",
    }}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

// ---------------------------------------------------------------------------
// Skeleton padrão de página
// ---------------------------------------------------------------------------

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-8 w-80 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="h-4 w-96 animate-pulse rounded-xl bg-slate-200/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-slate-200/70" />
      <div className="h-56 animate-pulse rounded-xl bg-slate-200/70" />
      <span className="sr-only">Carregando dados da API…</span>
    </div>
  );
}
