/**
 * Cliente tipado da API do Investment Intelligence OS (backend FastAPI do
 * repositório irmão `Celest.ia-v2-Alpha`). Contrato resumido em
 * `docs/INTEGRATION.md` (Fase 5).
 *
 * Regras: o frontend NUNCA calcula indicadores nem inventa dados. Sem mock:
 * API indisponível vira estado de erro explícito na UI.
 */

export const IIOS_API_URL =
  process.env.NEXT_PUBLIC_IIOS_API_URL ?? "http://localhost:8000";

/**
 * MODO DEMONSTRAÇÃO (`NEXT_PUBLIC_IIOS_DEMO=1`): serve fixtures congeladas e
 * rotuladas de `demo-data.ts` no lugar da API — para prévias sem backend.
 * NUNCA é ativado silenciosamente: exige a variável explícita no build e a
 * UI exibe banner "DEMONSTRAÇÃO" em todas as telas.
 */
export const IIOS_DEMO = process.env.NEXT_PUBLIC_IIOS_DEMO === "1";

const BASE = `${IIOS_API_URL.replace(/\/+$/, "")}/v1`;

export const BACKEND_START_COMMAND = "uvicorn investment_os.api.main:app";

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export class IIOSApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "IIOSApiError";
    this.status = status;
    this.code = code;
  }
}

export class IIOSUnreachableError extends Error {
  constructor() {
    super(
      `Não foi possível conectar à API do backend em ${IIOS_API_URL}. ` +
        `Inicie o backend: ${BACKEND_START_COMMAND}`
    );
    this.name = "IIOSUnreachableError";
  }
}

export function isApiError(error: unknown, code?: string): error is IIOSApiError {
  return (
    error instanceof IIOSApiError && (code === undefined || error.code === code)
  );
}

export function isUnreachableError(
  error: unknown
): error is IIOSUnreachableError {
  return error instanceof IIOSUnreachableError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Erro inesperado ao comunicar com a API do backend.";
}

// ---------------------------------------------------------------------------
// Tipos — espelham o contrato /v1 do backend
// ---------------------------------------------------------------------------

export type Confianca = "BAIXA" | "MEDIA" | "ALTA";

export interface ProfileQuestion {
  id: number;
  dimension: string;
  text: string;
  options: string[];
}

export interface ProfileAssessment {
  assessment_id: number;
  scores: Record<string, number>;
  conflicts: string[];
  pending_questions: ProfileQuestion[];
  confidence: Confianca;
}

export interface LatestAssessment {
  assessment_id: number;
  scores: Record<string, number>;
  conflicts: string[];
  confidence: Confianca;
  created_at: string;
}

export type PolicyStatus = "draft" | "confirmed" | "superseded";

/** Conteúdo da IPS: JSON estruturado do backend (editável como texto na UI). */
export type PolicyContent = Record<string, unknown>;

export interface PolicyDraftResult {
  policy_id: number;
  version_id: number;
  version: number;
  status: "draft";
  content: PolicyContent;
}

export interface PolicyVersion {
  version_id: number;
  version: number;
  status: PolicyStatus;
  created_at: string;
  author: string | null;
  reason: string | null;
  prev_version: string | number | null;
  confirmed_at: string | null;
  content: PolicyContent;
}

export interface PolicyConfirmResult {
  version_id: number;
  version: number;
  status: "confirmed";
}

export interface ConfirmedPolicy {
  version_id: number;
  version: number;
  content: PolicyContent;
  confirmed_at: string;
}

export type ImportRowStatus =
  | "ok"
  | "ambiguous"
  | "unknown"
  | "rejected"
  | "duplicate";

export type CostStatus = "conhecido" | "desconhecido";

export type AssetClassApi =
  | "acao_br"
  | "fii"
  | "bdr"
  | "etf"
  | "renda_fixa"
  | "outro";

/** Resolução de instrumento retornada pelo backend (objeto, pode ser `{}`). */
export interface InstrumentResolution {
  status?: "ok" | "ambiguous" | "unknown";
  confidence?: Confianca;
  method?: string;
  reason?: string;
  ticker?: string;
  cnpj?: string | null;
  classe?: string | null;
  cd_cvm?: string | null;
  setor?: string | null;
  asset_class?: string | null;
  asset_class_hint?: string | null;
}

export interface ImportRow {
  row_id: number;
  row_index: number;
  status: ImportRowStatus;
  reason: string | null;
  confidence: Confianca | null;
  ticker: string | null;
  quantity: number | null;
  avg_cost: number | null;
  cost_status: CostStatus;
  currency: string | null;
  data_base: string | null;
  resolution: InstrumentResolution | null;
}

/** Resumo legível da resolução (método + motivo), nunca o objeto cru. */
export function resolutionToLabel(res: InstrumentResolution | null): string | null {
  if (!res || Object.keys(res).length === 0) return null;
  const parts: string[] = [];
  if (res.method === "fca_listing") parts.push("listagem oficial FCA/CVM");
  else if (res.method === "user_override") parts.push("confirmado manualmente");
  else if (res.method === "unresolved") parts.push("não resolvido");
  if (res.asset_class) parts.push(`classe ${res.asset_class}`);
  if (res.reason) parts.push(res.reason);
  return parts.length ? parts.join(" · ") : null;
}

export interface ImportPreview {
  import_id: number;
  status: string;
  adapter: string;
  file_sha256: string;
  data_base: string | null;
  pii_removed_count: number;
  counts: Record<string, number>;
  rows: ImportRow[];
  requires_user_confirmation: boolean;
}

export interface ImportConfirmResult {
  snapshot_id: number;
  version: number;
  idempotent: boolean;
  excluded_rows?: number | Array<string | number>;
}

export interface SnapshotSummary {
  id: number;
  version: number;
  created_at: string;
  data_base: string | null;
}

export interface SnapshotDetail {
  snapshot: SnapshotSummary & Record<string, unknown>;
  positions: Array<Record<string, unknown>>;
}

export type Severidade = "critica" | "nao_critica";

export interface AnalysisPosition {
  ticker: string;
  asset_class: string;
  quantity: number;
  avg_cost: number | null;
  cost_status: CostStatus;
  price?: number | null;
  price_date?: string | null;
  price_staleness_days?: number | null;
  market_value: number | null;
  weight_pct?: number | null;
  price_status: string;
  setor: string | null;
  natureza?: string | null;
}

export interface PolicyViolation {
  tipo: string;
  chave: string;
  peso_pct: number;
  severidade: Severidade;
  faixa?: { min_pct: number; max_pct: number } | null;
  limite_pct?: number | null;
}

export interface QualidadeDados {
  posicoes_total: number;
  posicoes_precificadas: number;
  cobertura_pct: number;
  sem_preco: string[];
  custo_desconhecido: string[];
  precos_stale_7d: string[];
}

export interface SnapshotAnalysis {
  patrimonio_precificado_brl: number | null;
  nota_patrimonio: string;
  pesos: {
    por_ativo: Record<string, number>;
    por_emissor: Record<string, number>;
    por_setor: Record<string, number>;
    por_classe: Record<string, number>;
    por_moeda: Record<string, number>;
    por_pais: Record<string, number>;
  };
  posicoes: AnalysisPosition[];
  concentracao: {
    maior_posicao_pct: number | null;
    hhi: number | null;
  };
  violacoes: PolicyViolation[];
  qualidade_dados: QualidadeDados;
  confianca: string;
  fontes: string | string[] | Record<string, string>;
  data_base_carteira: string | null;
  data_analise: string;
}

export interface RebalanceAction {
  seq: number;
  scope: string;
  key: string;
  action: string;
  priority: number | string;
  amount_brl: number | null;
  current_pct?: number | null;
  target_min_pct?: number | null;
  target_max_pct?: number | null;
  rationale: string;
  revisao?: string | null;
  custo_imposto?: string | null;
}

export interface RebalancePlan {
  plan_id: number;
  aporte_mensal_brl: number;
  premissas: string[];
  proximo_aporte: Record<string, number>;
  plano_3_meses: Array<Record<string, number>>;
  plano_6_meses: Array<Record<string, number>>;
  caminho_ate_faixas: {
    dentro_das_faixas_apos_simulacao: boolean;
    pesos_projetados_pct: Record<string, number>;
  };
  vendas_evitadas_brl: number;
  concentracao_antes: {
    maior_posicao_pct?: number | null;
    hhi?: number | null;
  } | null;
  exposicao_cambial_antes: Record<string, number> | number | null;
  violacoes_remanescentes: PolicyViolation[];
  acoes: RebalanceAction[];
  confianca: string;
  qualidade_dados: QualidadeDados;
}

export interface PortfolioIssue {
  id: number;
  created_at: string;
  scope: string;
  severity: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Tipos — Fase 6 (visão geral, macro, Tesouro Direto)
// ---------------------------------------------------------------------------

/** Confiança dos regimes macro: inclui `INDISPONIVEL` além da escala da Fase 5. */
export type ConfiancaMacro = Confianca | "INDISPONIVEL";

/** Bloco declarado indisponível pelo backend (nunca inventa valores). */
export interface IndisponivelBlock {
  status: "indisponivel";
  motivo?: string;
}

export function isIndisponivel(
  block: object | IndisponivelBlock | null | undefined
): block is IndisponivelBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "status" in block &&
    (block as { status?: unknown }).status === "indisponivel"
  );
}

export interface ScreenerAprovada {
  ticker: string;
  empresa: string;
  /** A API pode serializar como número ou string decimal; nunca converter ausência em 0. */
  pl: number | string | null;
  pvpa: number | string | null;
}

export interface OverviewScreener {
  run_date: string;
  universo: number;
  contagens: Record<string, number>;
  aprovadas: ScreenerAprovada[];
  preset: string;
}

export interface OverviewTesouroReferencia {
  taxa_pct: number;
  percentil_historico: number | null;
  threshold_monitorado_pct: number;
  threshold_origem?: string;
}

export interface OverviewTesouro {
  data_base: string;
  n_titulos: number;
  janelas_no_radar: number;
  referencia_ipca2050: OverviewTesouroReferencia | null;
}

export interface OverviewMacro {
  data_geracao: string;
  regimes: Array<{
    dimensao: string;
    estado: string;
    confianca: ConfiancaMacro;
    eh_expectativa?: boolean;
  }>;
}

export interface OverviewCarteira {
  snapshots: number;
  ultimo_snapshot_em: string | null;
  ips_confirmada: boolean;
}

export interface SaudeDados {
  ultima_atualizacao_gold: {
    screener: string | null;
    tesouro: string | null;
    macro: string | null;
  };
  auditoria_ingestao: string | null;
  nota: string;
}

export interface Overview {
  gerado_em: string;
  screener: OverviewScreener | IndisponivelBlock;
  tesouro: OverviewTesouro | IndisponivelBlock;
  macro: OverviewMacro | IndisponivelBlock;
  carteira: OverviewCarteira | IndisponivelBlock;
  saude_dados: SaudeDados;
}

export interface SeriePonto {
  data: string;
  valor: number;
}

export interface MacroRegime {
  dimensao: string;
  estado: string;
  detalhe: string;
  confianca: ConfiancaMacro;
  data_base: string | null;
  fonte: string;
  natureza: string;
}

export interface MacroRegimes {
  data_geracao: string;
  regimes: MacroRegime[];
  series_recentes: Record<string, SeriePonto[]>;
  premissas: string[];
  fontes: Record<string, string>;
  fora_do_escopo_desta_fase: string[];
}

export interface MacroSerie {
  serie_id: string;
  pontos: SeriePonto[];
  fonte: string;
}

export interface TesouroHistorico {
  pregoes: number;
  primeiro: string;
  percentil_taxa_atual: number;
  maxima: number;
  minima: number;
  media: number;
  mediana: number;
}

export interface TesouroTitulo {
  tipo: string;
  vencimento: string;
  data_base: string;
  taxa_compra_pct: number;
  taxa_venda_pct: number | null;
  pu_compra: number | null;
  pu_venda: number | null;
  fonte: string;
  modelado: boolean;
  termo?: "real" | "nominal";
  duration_macaulay_anos?: number;
  modified_duration_anos?: number;
  dv01_brl?: number;
  convexidade?: number;
  motivo_nao_modelado?: string;
  historico?: TesouroHistorico;
}

export interface CurvaPonto {
  vencimento: string;
  taxa_pct: number;
  tipo: string;
}

export interface RadarJanela {
  tipo: string;
  vencimento: string;
  taxa_atual_pct: number;
  percentil: number;
  criterio: string;
  saida_hysteresis_pct: number;
  invalidacao: string;
  nota: string;
  confianca: ConfiancaMacro;
}

export interface ParametrosRadar {
  percentil_entrada: number;
  percentil_saida_hysteresis: number;
  min_pregoes: number;
}

export interface TesouroPainel {
  data_base: string;
  fonte: string;
  titulos: TesouroTitulo[];
  curvas: {
    nominal_prefixado: CurvaPonto[];
    real_ipca: CurvaPonto[];
    nota: string;
  };
  radar_janelas: RadarJanela[];
  parametros_radar: ParametrosRadar;
  historico_oficial_desde: string;
}

export interface CenarioMTM {
  choque_bps: number;
  taxa_pct: number;
  pu_novo: number;
  variacao_pct: number;
  efeito_duration_brl: number;
  efeito_convexidade_brl: number;
  residuo_brl: number;
}

export interface TesouroCenarios {
  tipo: string;
  vencimento: string;
  data_base: string;
  taxa_atual_pct: number;
  risco: {
    duration_macaulay_anos: number;
    modified_duration_anos: number;
    dv01_brl: number;
    convexidade: number;
  };
  cenarios_mtm: CenarioMTM[];
  fonte: string;
}

// ---------------------------------------------------------------------------
// Tipos — Fase 7 (banco de ativos B3, cotação intradiária, chat)
// ---------------------------------------------------------------------------

/** Tipos de ativo do registro B3 (chaves do bloco `tipos` de /v1/ativos). */
export type TipoAtivoB3 = "acao_br" | "fii" | "bdr" | "etf_ou_fundo" | "unit";

export interface AtivoB3 {
  ticker: string;
  /** Classificação HEURÍSTICA do backend (ver `classificacao_confianca`). */
  tipo: string;
  /** Confiança da classificação heurística do tipo — não é dado oficial. */
  classificacao_confianca: Confianca;
  cnpj_emissor: string | null;
  ultimo_pregao: string;
  /** Fechamento B3 NÃO ajustado por proventos; ausência = `null`, nunca 0. */
  ultimo_fechamento: number | null;
  especificacao: string;
  ajustado_por_proventos: boolean;
}

export interface AtivosPage {
  total: number;
  pagina: number;
  limite: number;
  data_base: string;
  fonte: string;
  tipos: Partial<Record<TipoAtivoB3, number>> & Record<string, number>;
  ativos: AtivoB3[];
}

export interface AtivoDetalhe extends AtivoB3 {
  fonte: string;
}

export interface CotacaoIntradiaria {
  preco: number;
  variacao_pct: number | null;
  fechamento_anterior: number | null;
  data_hora: string | null;
  moeda: string;
  /** Sempre rotulada pelo backend como AGREGADOR — nunca fonte primária. */
  fonte: string;
  aviso: string;
  usavel_em_calculos: boolean;
  token_configurado: boolean;
}

export interface FechamentoOficialD1 {
  fechamento: number | null;
  pregao: string;
  fonte: string;
}

export interface AtivoIntradiario {
  ticker: string;
  intradiario: CotacaoIntradiaria;
  oficial_d1: FechamentoOficialD1;
  consultado_em: string;
}

export interface ChatMensagem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatEvidencia {
  afirmacao: string;
  valor?: string | number | null;
  fonte: string;
  data_base?: string | null;
}

export interface ChatRespostaEstruturada {
  resposta_direta: string;
  evidencias: ChatEvidencia[];
  fontes: string[];
  data_base: string | null;
  premissas: string[];
  confianca: Confianca;
  riscos: string[];
  contra_argumento: string;
  dados_ausentes: string[];
  gatilhos_revisao: string[];
}

export interface ChatFerramentaChamada {
  ferramenta: string;
  argumentos: Record<string, unknown>;
  ok: boolean;
  codigo_erro: string | null;
}

export interface ChatResposta {
  resposta: ChatRespostaEstruturada;
  ferramentas_chamadas: ChatFerramentaChamada[];
  modelo: string;
}

export interface ChatFerramenta {
  nome: string;
  descricao: string;
}

export interface ChatFerramentas {
  ferramentas: ChatFerramenta[];
  nota: string;
}

// ---------------------------------------------------------------------------
// Núcleo de requisições
// ---------------------------------------------------------------------------

interface ErrorDetailShape {
  code?: string;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (IIOS_DEMO) {
    // Import dinâmico: mantém as fixtures fora do bundle quando o modo está off.
    const { demoRequest } = await import("./demo-data");
    return demoRequest<T>(path, init);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new IIOSUnreachableError();
  }

  if (!response.ok) {
    let code = "erro_desconhecido";
    let message = `A API do backend respondeu com erro ${response.status}.`;
    try {
      const body = (await response.json()) as {
        detail?: ErrorDetailShape | string;
      };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (body.detail) {
        code = body.detail.code ?? code;
        message = body.detail.message ?? message;
      }
    } catch {
      // corpo não-JSON: mantém a mensagem genérica segura
    }
    throw new IIOSApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

export function fetchProfileQuestions(
  answers: Record<string, string>
): Promise<ProfileQuestion[]> {
  return postJson<ProfileQuestion[]>("/profile/questions", { answers });
}

export function assessProfile(
  answers: Record<string, string>
): Promise<ProfileAssessment> {
  return postJson<ProfileAssessment>("/profile/assess", { answers });
}

/** Retorna `null` quando ainda não existe avaliação (404 `no_assessment`). */
export async function fetchLatestAssessment(): Promise<LatestAssessment | null> {
  try {
    return await request<LatestAssessment>("/profile/assessment/latest");
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Política (IPS)
// ---------------------------------------------------------------------------

export function draftPolicy(input: {
  reason: string;
  author?: string;
  content?: PolicyContent;
}): Promise<PolicyDraftResult> {
  return postJson<PolicyDraftResult>("/policy/draft", input);
}

export function fetchPolicyVersions(): Promise<PolicyVersion[]> {
  return request<PolicyVersion[]>("/policy/versions");
}

export function confirmPolicy(versionId: number): Promise<PolicyConfirmResult> {
  return request<PolicyConfirmResult>(
    `/policy/${encodeURIComponent(versionId)}/confirm`,
    { method: "POST" }
  );
}

/** Retorna `null` quando não há IPS confirmada (404 `no_confirmed_policy`). */
export async function fetchConfirmedPolicy(): Promise<ConfirmedPolicy | null> {
  try {
    return await request<ConfirmedPolicy>("/policy/confirmed");
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Importação de carteira (B3)
// ---------------------------------------------------------------------------

export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export function importPortfolio(file: File): Promise<ImportPreview> {
  const form = new FormData();
  form.append("file", file);
  // Sem Content-Type manual: o browser define o boundary do multipart.
  return request<ImportPreview>("/portfolio/import", {
    method: "POST",
    body: form,
  });
}

export function fetchImportPreview(importId: number): Promise<ImportPreview> {
  return request<ImportPreview>(
    `/portfolio/import/${encodeURIComponent(importId)}/preview`
  );
}

export function correctImportRow(
  importId: number,
  rowId: number,
  correction: { ticker: string; asset_class?: AssetClassApi }
): Promise<ImportPreview> {
  return postJson<ImportPreview>(
    `/portfolio/import/${encodeURIComponent(importId)}/rows/${encodeURIComponent(
      rowId
    )}/correct`,
    correction
  );
}

export function confirmImport(
  importId: number,
  acceptPartial: boolean
): Promise<ImportConfirmResult> {
  return postJson<ImportConfirmResult>(
    `/portfolio/import/${encodeURIComponent(importId)}/confirm`,
    { accept_partial: acceptPartial }
  );
}

export function excludedRowsCount(
  excluded: ImportConfirmResult["excluded_rows"]
): number {
  if (excluded === undefined || excluded === null) return 0;
  if (typeof excluded === "number") return excluded;
  return excluded.length;
}

// ---------------------------------------------------------------------------
// Carteira / snapshots
// ---------------------------------------------------------------------------

export function fetchSnapshots(): Promise<SnapshotSummary[]> {
  return request<SnapshotSummary[]>("/portfolio/snapshots");
}

export function fetchSnapshot(id: number): Promise<SnapshotDetail> {
  return request<SnapshotDetail>(
    `/portfolio/snapshots/${encodeURIComponent(id)}`
  );
}

export function fetchSnapshotAnalysis(id: number): Promise<SnapshotAnalysis> {
  return request<SnapshotAnalysis>(
    `/portfolio/snapshots/${encodeURIComponent(id)}/analysis`
  );
}

export function rebalanceSnapshot(id: number,
  months?: number
): Promise<RebalancePlan> {
  return postJson<RebalancePlan>(
    `/portfolio/snapshots/${encodeURIComponent(id)}/rebalance`,
    months === undefined ? {} : { months }
  );
}

export function fetchPortfolioIssues(): Promise<PortfolioIssue[]> {
  return request<PortfolioIssue[]>("/portfolio/issues");
}

// ---------------------------------------------------------------------------
// Fase 6 — visão geral, macro, Tesouro Direto
// ---------------------------------------------------------------------------

export function fetchOverview(): Promise<Overview> {
  return request<Overview>("/overview");
}

export function fetchMacroRegimes(): Promise<MacroRegimes> {
  return request<MacroRegimes>("/macro/regimes");
}

export function fetchMacroSerie(serieId: string): Promise<MacroSerie> {
  return request<MacroSerie>(`/macro/series/${encodeURIComponent(serieId)}`);
}

export function fetchTesouroTitulos(): Promise<TesouroPainel> {
  return request<TesouroPainel>("/tesouro/titulos");
}

/** `tipo` contém espaços (ex.: "Tesouro IPCA+") — sempre codificado na URL. */
export function fetchTesouroCenarios(
  tipo: string,
  vencimento: string
): Promise<TesouroCenarios> {
  return request<TesouroCenarios>(
    `/tesouro/titulos/${encodeURIComponent(tipo)}/${encodeURIComponent(
      vencimento
    )}/cenarios`
  );
}

// ---------------------------------------------------------------------------
// Fase 7 — banco de ativos B3, cotação intradiária, chat
// ---------------------------------------------------------------------------

export interface FetchAtivosParams {
  tipo?: string;
  busca?: string;
  limite?: number;
  pagina?: number;
}

/** 404 `registry_missing` = registro gold ausente; 422 `tipo_invalido`. */
export function fetchAtivos(params: FetchAtivosParams = {}): Promise<AtivosPage> {
  const query = new URLSearchParams();
  if (params.tipo) query.set("tipo", params.tipo);
  if (params.busca) query.set("busca", params.busca);
  if (params.limite !== undefined) query.set("limite", String(params.limite));
  if (params.pagina !== undefined) query.set("pagina", String(params.pagina));
  const qs = query.toString();
  return request<AtivosPage>(`/ativos${qs ? `?${qs}` : ""}`);
}

/** 404 `ativo_not_found` quando o ticker não existe no registro. */
export function fetchAtivo(ticker: string): Promise<AtivoDetalhe> {
  return request<AtivoDetalhe>(`/ativos/${encodeURIComponent(ticker)}`);
}

/**
 * Cotação intradiária de AGREGADOR (indicativa, `usavel_em_calculos: false`)
 * + fechamento oficial D-1. 503 `intradiario_indisponivel` = exibir o
 * fechamento oficial D-1 como fallback, SEM esconder o erro.
 */
export function fetchAtivoIntradiario(ticker: string): Promise<AtivoIntradiario> {
  return request<AtivoIntradiario>(
    `/ativos/${encodeURIComponent(ticker)}/intradiario`
  );
}

/** Limites do contrato POST /v1/chat (validação 422 no backend). */
export const CHAT_PERGUNTA_MIN = 3;
export const CHAT_PERGUNTA_MAX = 4000;
export const CHAT_HISTORICO_MAX = 20;

/**
 * Pergunta ao assistente. O LLM NUNCA calcula: só orquestra ferramentas
 * determinísticas do backend. 503 `chat_indisponivel` = backend sem
 * ANTHROPIC_API_KEY (estado dedicado na UI; nenhuma outra tela depende disso).
 */
export function askChat(
  pergunta: string,
  historico: ChatMensagem[] = []
): Promise<ChatResposta> {
  return postJson<ChatResposta>("/chat", {
    pergunta,
    historico: historico.slice(-CHAT_HISTORICO_MAX),
  });
}

export function fetchChatFerramentas(): Promise<ChatFerramentas> {
  return request<ChatFerramentas>("/chat/ferramentas");
}

// ---------------------------------------------------------------------------
// Utilitários de exibição (não calculam indicadores; só normalizam formatos)
// ---------------------------------------------------------------------------

/** Normaliza `fontes` (string, lista ou mapa) para uma lista exibível. */
export function fontesToList(
  fontes: SnapshotAnalysis["fontes"] | undefined | null
): string[] {
  if (!fontes) return [];
  if (typeof fontes === "string") return fontes.split(";").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(fontes)) return fontes.map(String);
  return Object.entries(fontes).map(([key, value]) => `${key}: ${String(value)}`);
}

/** Formata a faixa `{min_pct, max_pct}` de uma violação como texto. */
export function faixaToLabel(faixa: PolicyViolation["faixa"]): string | null {
  if (!faixa || typeof faixa !== "object") return null;
  return `${faixa.min_pct ?? "?"}–${faixa.max_pct ?? "?"}%`;
}

/**
 * Normaliza um valor que a API pode serializar como número ou string decimal
 * ("5.08"). Ausência/valor não numérico vira `null` — NUNCA 0.
 */
export function toFiniteNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
