"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Award,
  Bot,
  FileText,
  Play,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import {
  runAuditorAction,
  runComiteAction,
  runDREAction,
  runPesquisaAction,
  runTriagemAction,
} from "@/lib/agents/actions";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import {
  AGENT_DEFINITIONS,
  type AgentId,
  type AgentLogEntry,
  type AgentStatus,
  type ComiteResult,
  type PipelineScope,
} from "@/lib/agents/types";
import { useAppStore } from "@/lib/store/app-store";
import { cn, delay, formatBRL, formatPercentPlain } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AgentPipelineTracker,
  AgentTerminal,
  type AgentRuntimeState,
  type TerminalLine,
} from "@/components/agent-terminal";

const LOG_STREAM_DELAY_MS = 110;

type StatusMap = Record<AgentId, AgentStatus>;
type DurationMap = Record<AgentId, number | null>;

const INITIAL_STATUS: StatusMap = {
  triagem: "idle",
  pesquisa: "idle",
  auditor: "idle",
  dre: "idle",
  comite: "idle",
};

const INITIAL_DURATIONS: DurationMap = {
  triagem: null,
  pesquisa: null,
  auditor: null,
  dre: null,
  comite: null,
};

export default function AgentesPage() {
  const { positions, hydrated } = useAppStore();

  const [scope, setScope] = useState<PipelineScope>("mercado");
  const [statuses, setStatuses] = useState<StatusMap>(INITIAL_STATUS);
  const [durations, setDurations] = useState<DurationMap>(INITIAL_DURATIONS);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [report, setReport] = useState<ComiteResult | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runIdRef = useRef(0);
  const streamQueueRef = useRef<Promise<void>>(Promise.resolve());

  const portfolioTickers = useMemo(
    () => positions.map((p) => p.ticker),
    [positions]
  );
  const hasPortfolio = positions.length > 0;

  const setAgentStatus = useCallback((agentId: AgentId, status: AgentStatus) => {
    setStatuses((prev) => ({ ...prev, [agentId]: status }));
  }, []);

  const streamAgentLogs = useCallback(
    (runId: number, codename: string, logs: AgentLogEntry[]): Promise<void> => {
      const task = streamQueueRef.current.then(async () => {
        for (const entry of logs) {
          if (runIdRef.current !== runId) return;
          setTerminalLines((prev) => [
            ...prev,
            { ...entry, agentCodename: codename },
          ]);
          await delay(LOG_STREAM_DELAY_MS);
        }
      });
      streamQueueRef.current = task;
      return task;
    },
    []
  );

  const resetPipeline = useCallback(() => {
    runIdRef.current += 1;
    streamQueueRef.current = Promise.resolve();
    setStatuses(INITIAL_STATUS);
    setDurations(INITIAL_DURATIONS);
    setTerminalLines([]);
    setReport(null);
    setPipelineError(null);
    setIsRunning(false);
  }, []);

  const runPipeline = useCallback(async () => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    streamQueueRef.current = Promise.resolve();

    setTerminalLines([]);
    setReport(null);
    setPipelineError(null);
    setDurations(INITIAL_DURATIONS);
    setIsRunning(true);
    setStatuses({
      triagem: "running",
      pesquisa: "running",
      auditor: "queued",
      dre: "queued",
      comite: "queued",
    });

    const codenameOf = (agentId: AgentId): string =>
      AGENT_DEFINITIONS.find((d) => d.id === agentId)?.codename ?? agentId;

    try {
      const [triagemStep, pesquisaStep] = await Promise.all([
        runTriagemAction(scope, portfolioTickers).then(async (step) => {
          if (runIdRef.current !== runId) return step;
          setDurations((prev) => ({ ...prev, triagem: step.durationMs }));
          await streamAgentLogs(runId, codenameOf("triagem"), step.logs);
          setAgentStatus("triagem", step.status === "done" ? "done" : "error");
          return step;
        }),
        runPesquisaAction(scope, portfolioTickers).then(async (step) => {
          if (runIdRef.current !== runId) return step;
          setDurations((prev) => ({ ...prev, pesquisa: step.durationMs }));
          await streamAgentLogs(runId, codenameOf("pesquisa"), step.logs);
          setAgentStatus("pesquisa", step.status === "done" ? "done" : "error");
          return step;
        }),
      ]);

      if (runIdRef.current !== runId) return;
      if (!triagemStep.result || !pesquisaStep.result) {
        throw new Error(
          triagemStep.error ?? pesquisaStep.error ?? "Falha nos agentes de entrada"
        );
      }

      setAgentStatus("auditor", "running");
      const auditorStep = await runAuditorAction(
        triagemStep.result,
        pesquisaStep.result
      );
      if (runIdRef.current !== runId) return;
      setDurations((prev) => ({ ...prev, auditor: auditorStep.durationMs }));
      await streamAgentLogs(runId, codenameOf("auditor"), auditorStep.logs);
      if (!auditorStep.result) {
        setAgentStatus("auditor", "error");
        throw new Error(auditorStep.error ?? "Falha no auditor de filtros");
      }
      setAgentStatus("auditor", "done");

      setAgentStatus("dre", "running");
      const dreStep = await runDREAction(auditorStep.result);
      if (runIdRef.current !== runId) return;
      setDurations((prev) => ({ ...prev, dre: dreStep.durationMs }));
      await streamAgentLogs(runId, codenameOf("dre"), dreStep.logs);
      if (!dreStep.result) {
        setAgentStatus("dre", "error");
        throw new Error(dreStep.error ?? "Falha no analista de DRE");
      }
      setAgentStatus("dre", "done");

      setAgentStatus("comite", "running");
      const comiteStep = await runComiteAction(
        triagemStep.result,
        pesquisaStep.result,
        auditorStep.result,
        dreStep.result
      );
      if (runIdRef.current !== runId) return;
      setDurations((prev) => ({ ...prev, comite: comiteStep.durationMs }));
      await streamAgentLogs(runId, codenameOf("comite"), comiteStep.logs);
      if (!comiteStep.result) {
        setAgentStatus("comite", "error");
        throw new Error(comiteStep.error ?? "Falha no comitê de investimento");
      }
      setAgentStatus("comite", "done");
      setReport(comiteStep.result);
    } catch (error) {
      if (runIdRef.current === runId) {
        setPipelineError(
          error instanceof Error
            ? error.message
            : "Falha inesperada na execução do pipeline"
        );
      }
    } finally {
      if (runIdRef.current === runId) {
        setIsRunning(false);
      }
    }
  }, [scope, portfolioTickers, setAgentStatus, streamAgentLogs]);

  const agents: AgentRuntimeState[] = AGENT_DEFINITIONS.map((definition) => ({
    definition,
    status: statuses[definition.id],
    logs: [],
    durationMs: durations[definition.id],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="h-6 w-6 text-primary" />
            Análise Multi-Agente
          </h1>
          <p className="text-sm text-muted-foreground">
            Pipeline sequencial-paralelo com 5 agentes especializados: triagem
            fundamentalista, contexto, auditoria, DRE e comitê final.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-white/10 bg-surface p-1">
            <button
              type="button"
              onClick={() => setScope("mercado")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "mercado"
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mercado B3
            </button>
            <button
              type="button"
              disabled={!hasPortfolio}
              onClick={() => setScope("carteira")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                scope === "carteira"
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Minha carteira
            </button>
          </div>
          <Button onClick={() => void runPipeline()} disabled={isRunning || !hydrated}>
            <Play className="h-4 w-4" />
            {isRunning ? "Pipeline em execução..." : "Executar análise"}
          </Button>
          {(report || pipelineError) && !isRunning && (
            <Button variant="ghost" size="icon" onClick={resetPipeline} aria-label="Reiniciar pipeline">
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {scope === "carteira" && !hasPortfolio && (
        <p className="text-xs text-amber-300/90">
          Sem carteira importada — o escopo “Minha carteira” usa o Dashboard
          como fonte.
        </p>
      )}

      {pipelineError && (
        <div className="flex items-start gap-3 rounded-xl border border-loss/30 bg-loss/[0.07] px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <div>
            <p className="font-medium text-loss">Pipeline interrompido</p>
            <p className="text-muted-foreground">{pipelineError}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline de agentes</CardTitle>
              <CardDescription>
                Agentes 1 e 2 executam em paralelo; 3, 4 e 5 em sequência.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentPipelineTracker agents={agents} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prompts dos agentes</CardTitle>
              <CardDescription>
                Instruções de sistema que governam cada especialista.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {AGENT_DEFINITIONS.map((definition) => (
                <details
                  key={definition.id}
                  className="group rounded-xl border border-white/[0.06] bg-surface/60"
                >
                  <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group-open:text-foreground">
                    {definition.name}
                  </summary>
                  <pre className="scrollbar-thin max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-white/[0.06] px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                    {AGENT_PROMPTS[definition.id]}
                  </pre>
                </details>
              ))}
            </CardContent>
          </Card>
        </div>

        <AgentTerminal lines={terminalLines} isRunning={isRunning} />
      </div>

      {report && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <Award className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">
              Relatório Final do Comitê — Top 5
            </h2>
          </div>

          <div className="grid gap-4">
            {report.picks.map((pick) => (
              <Card key={pick.ticker}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 font-mono text-sm font-bold text-primary ring-1 ring-primary/30">
                        #{pick.rank}
                      </span>
                      <div>
                        <p className="text-base font-semibold">
                          {pick.ticker}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            {pick.name}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pick.sector} · {formatBRL(pick.currentPrice)} · DY{" "}
                          {formatPercentPlain(pick.dividendYield)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">
                        score {pick.finalScore.toFixed(2)}
                      </Badge>
                      <Badge variant="outline">
                        alocação {pick.suggestedAllocationPercent}%
                      </Badge>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-foreground/90">
                    {pick.thesis}
                  </p>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Justificativa macroeconômica
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {pick.macroJustification}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {pick.risks.map((risk) => (
                      <Badge key={risk} variant="muted" className="font-normal">
                        ⚠ {risk}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Parecer macro do comitê
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {report.marketOutlook}
              </p>
              <Separator />
              <p className="text-xs leading-relaxed text-muted-foreground/70">
                {report.disclaimer}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
