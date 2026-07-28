"use client";

import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type {
  AgentDefinition,
  AgentLogEntry,
  AgentStatus,
} from "@/lib/agents/types";
import { cn } from "@/lib/utils";

export interface AgentRuntimeState {
  definition: AgentDefinition;
  status: AgentStatus;
  logs: AgentLogEntry[];
  durationMs: number | null;
}

export interface TerminalLine extends AgentLogEntry {
  agentCodename: string;
}

const LEVEL_STYLES: Record<AgentLogEntry["level"], string> = {
  info: "text-zinc-300",
  data: "text-sky-300",
  success: "text-emerald-400",
  warn: "text-amber-300",
  error: "text-rose-400",
};

function StatusIcon({ status }: { status: AgentStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-profit" />;
    case "error":
      return <XCircle className="h-4 w-4 text-loss" />;
    case "queued":
      return <Circle className="h-4 w-4 animate-pulse-dot text-amber-600" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40" />;
  }
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "aguardando",
  queued: "na fila",
  running: "executando",
  done: "concluído",
  error: "falhou",
};

export function AgentPipelineTracker({
  agents,
}: {
  agents: AgentRuntimeState[];
}) {
  return (
    <ol className="space-y-1.5">
      {agents.map((agent) => (
        <li
          key={agent.definition.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
            agent.status === "running"
              ? "border-primary/30 bg-primary/[0.06]"
              : agent.status === "done"
                ? "border-border bg-surface"
                : "border-border bg-surface/50"
          )}
        >
          <StatusIcon status={agent.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {agent.definition.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {agent.definition.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span
              className={cn(
                "font-mono text-[11px] uppercase tracking-wider",
                agent.status === "running"
                  ? "text-primary"
                  : agent.status === "done"
                    ? "text-profit"
                    : agent.status === "error"
                      ? "text-loss"
                      : "text-muted-foreground/60"
              )}
            >
              {STATUS_LABELS[agent.status]}
            </span>
            {agent.durationMs !== null && (
              <span className="font-mono text-[11px] text-muted-foreground/60">
                {(agent.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AgentTerminal({
  lines,
  isRunning,
}: {
  lines: TerminalLine[];
  isRunning: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#0a0a0c]">
      <div className="flex items-center gap-2 border-b border-border bg-slate-50 px-4 py-2.5">
        <TerminalSquare className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs font-medium tracking-wide text-muted-foreground">
          TERMINAL DE OPERAÇÕES DE IA
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground/60">
          {isRunning ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-profit" />
              pipeline ativo
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              ocioso
            </>
          )}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="scrollbar-thin h-[420px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground/50">
            $ Aguardando início do pipeline. Selecione o escopo e execute a
            análise.
          </p>
        ) : (
          lines.map((line, index) => (
            <div key={`${line.timestamp}-${index}`} className="flex gap-2">
              <span className="shrink-0 select-none text-muted-foreground/40">
                {new Date(line.timestamp).toLocaleTimeString("pt-BR", {
                  hour12: false,
                })}
              </span>
              <span className="shrink-0 select-none text-primary/70">
                [{line.agentCodename}]
              </span>
              <span className={cn("break-words", LEVEL_STYLES[line.level])}>
                {line.message}
              </span>
            </div>
          ))
        )}
        {isRunning && (
          <div className="mt-1 flex items-center gap-1 text-primary">
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="inline-block h-3.5 w-2 animate-pulse-dot bg-primary/80" />
          </div>
        )}
      </div>
    </div>
  );
}
