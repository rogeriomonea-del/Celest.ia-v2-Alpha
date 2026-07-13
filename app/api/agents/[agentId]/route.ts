import { NextRequest, NextResponse } from "next/server";
import {
  runAuditorEngine,
  runComiteEngine,
  runDREEngine,
  runPesquisaEngine,
  runTriagemEngine,
} from "@/lib/agents/engine";
import type {
  AgentId,
  AuditorResult,
  DREResult,
  PesquisaResult,
  PipelineScope,
  TriagemResult,
} from "@/lib/agents/types";

export const dynamic = "force-dynamic";

const VALID_AGENTS: readonly AgentId[] = [
  "triagem",
  "pesquisa",
  "auditor",
  "dre",
  "comite",
];

interface AgentRequestBody {
  scope?: PipelineScope;
  portfolioTickers?: string[];
  triagem?: TriagemResult;
  pesquisa?: PesquisaResult;
  auditor?: AuditorResult;
  dre?: DREResult;
}

function isAgentId(value: string): value is AgentId {
  return (VALID_AGENTS as readonly string[]).includes(value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
): Promise<NextResponse> {
  const { agentId } = params;
  if (!isAgentId(agentId)) {
    return NextResponse.json(
      { error: `Agente desconhecido: ${agentId}. Válidos: ${VALID_AGENTS.join(", ")}` },
      { status: 404 }
    );
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    body = {};
  }

  const scope: PipelineScope = body.scope === "carteira" ? "carteira" : "mercado";
  const portfolioTickers = Array.isArray(body.portfolioTickers)
    ? body.portfolioTickers.filter((t): t is string => typeof t === "string")
    : [];

  try {
    switch (agentId) {
      case "triagem":
        return NextResponse.json(runTriagemEngine(scope, portfolioTickers));
      case "pesquisa":
        return NextResponse.json(runPesquisaEngine(scope, portfolioTickers));
      case "auditor": {
        if (!body.triagem || !body.pesquisa) {
          return NextResponse.json(
            { error: "Corpo inválido: auditor requer os resultados de triagem e pesquisa." },
            { status: 422 }
          );
        }
        return NextResponse.json(runAuditorEngine(body.triagem, body.pesquisa));
      }
      case "dre": {
        if (!body.auditor) {
          return NextResponse.json(
            { error: "Corpo inválido: dre requer o resultado do auditor." },
            { status: 422 }
          );
        }
        return NextResponse.json(runDREEngine(body.auditor));
      }
      case "comite": {
        if (!body.triagem || !body.pesquisa || !body.auditor || !body.dre) {
          return NextResponse.json(
            {
              error:
                "Corpo inválido: comite requer os resultados de triagem, pesquisa, auditor e dre.",
            },
            { status: 422 }
          );
        }
        return NextResponse.json(
          runComiteEngine(body.triagem, body.pesquisa, body.auditor, body.dre)
        );
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha inesperada na execução do agente",
      },
      { status: 500 }
    );
  }
}
