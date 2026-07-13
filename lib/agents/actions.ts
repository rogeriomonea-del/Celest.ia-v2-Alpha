"use server";

import {
  runAuditorEngine,
  runComiteEngine,
  runDREEngine,
  runPesquisaEngine,
  runTriagemEngine,
} from "@/lib/agents/engine";
import type {
  AgentId,
  AgentLogEntry,
  AgentStepResponse,
  AuditorResult,
  ComiteResult,
  DREResult,
  PesquisaResult,
  PipelineScope,
  TriagemResult,
} from "@/lib/agents/types";
import { delay } from "@/lib/utils";

const SIMULATED_LATENCY_MS: Record<AgentId, number> = {
  triagem: 1400,
  pesquisa: 2100,
  auditor: 1600,
  dre: 1900,
  comite: 2400,
};

async function executeStep<T>(
  agentId: AgentId,
  runner: () => { logs: AgentLogEntry[]; result: T }
): Promise<AgentStepResponse<T>> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  try {
    await delay(SIMULATED_LATENCY_MS[agentId]);
    const { logs, result } = runner();
    const finishedAt = new Date().toISOString();
    return {
      agentId,
      status: "done",
      startedAt,
      finishedAt,
      durationMs: Date.now() - start,
      logs,
      result,
      error: null,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    return {
      agentId,
      status: "error",
      startedAt,
      finishedAt,
      durationMs: Date.now() - start,
      logs: [],
      result: null,
      error:
        error instanceof Error ? error.message : "Falha inesperada na execução do agente",
    };
  }
}

export async function runTriagemAction(
  scope: PipelineScope,
  portfolioTickers: string[]
): Promise<AgentStepResponse<TriagemResult>> {
  return executeStep("triagem", () => runTriagemEngine(scope, portfolioTickers));
}

export async function runPesquisaAction(
  scope: PipelineScope,
  portfolioTickers: string[]
): Promise<AgentStepResponse<PesquisaResult>> {
  return executeStep("pesquisa", () => runPesquisaEngine(scope, portfolioTickers));
}

export async function runAuditorAction(
  triagem: TriagemResult,
  pesquisa: PesquisaResult
): Promise<AgentStepResponse<AuditorResult>> {
  return executeStep("auditor", () => runAuditorEngine(triagem, pesquisa));
}

export async function runDREAction(
  auditor: AuditorResult
): Promise<AgentStepResponse<DREResult>> {
  return executeStep("dre", () => runDREEngine(auditor));
}

export async function runComiteAction(
  triagem: TriagemResult,
  pesquisa: PesquisaResult,
  auditor: AuditorResult,
  dre: DREResult
): Promise<AgentStepResponse<ComiteResult>> {
  return executeStep("comite", () =>
    runComiteEngine(triagem, pesquisa, auditor, dre)
  );
}
