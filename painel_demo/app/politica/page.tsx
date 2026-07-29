"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardList,
  FileEdit,
  History,
  Info,
  Play,
  RotateCcw,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { clamp, formatNumber } from "@/lib/utils";
import {
  assessProfile,
  confirmPolicy,
  draftPolicy,
  errorMessage,
  fetchConfirmedPolicy,
  fetchLatestAssessment,
  fetchPolicyVersions,
  fetchProfileQuestions,
  isApiError,
  type ConfirmedPolicy,
  type PolicyContent,
  type PolicyVersion,
  type ProfileQuestion,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  ConfidenceBadge,
  EmptyState,
  MetaFooter,
  PageSkeleton,
  UnavailableValue,
  formatDateTimeBR,
  humanizeKey,
} from "@/components/investment-os/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AssessmentView {
  assessment_id: number;
  scores: Record<string, number>;
  conflicts: string[];
  confidence: string;
  created_at?: string;
}

const DIMENSION_INFO: Record<string, string> = {
  horizonte: "Por quanto tempo o dinheiro pode ficar investido sem resgate.",
  objetivo: "Finalidade principal do patrimônio: preservar, gerar renda ou crescer.",
  tolerancia_risco:
    "Quanta oscilação de curto prazo você suporta sem abandonar o plano.",
  tolerancia:
    "Quanta oscilação de curto prazo você suporta sem abandonar o plano.",
  capacidade:
    "Folga financeira real para assumir risco (renda, reserva, dívidas).",
  capacidade_financeira:
    "Folga financeira real para assumir risco (renda, reserva, dívidas).",
  conhecimento: "Familiaridade com produtos financeiros e mecânica de mercado.",
  experiencia: "Vivência prática com investimentos e ciclos de mercado.",
  liquidez: "Necessidade de resgatar recursos no curto prazo.",
};

function dimensionInfo(dimension: string): string {
  const key = dimension.toLowerCase().replace(/\s+/g, "_");
  return (
    DIMENSION_INFO[key] ??
    "Dimensão avaliada pelo questionário adaptativo do backend."
  );
}

const POLICY_STATUS_LABEL: Record<PolicyVersion["status"], string> = {
  draft: "Rascunho",
  confirmed: "Confirmada",
  superseded: "Substituída",
};

function policyStatusVariant(
  status: PolicyVersion["status"]
): "default" | "warning" | "muted" {
  if (status === "confirmed") return "default";
  if (status === "draft") return "warning";
  return "muted";
}

export default function PoliticaPage() {
  // ------------------------------------------------------------------ carga
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<unknown>(null);
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedPolicy | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    try {
      const [latest, versionList, confirmedPolicy] = await Promise.all([
        fetchLatestAssessment(),
        fetchPolicyVersions(),
        fetchConfirmedPolicy(),
      ]);
      setAssessment(latest);
      setVersions(versionList);
      setConfirmed(confirmedPolicy);
    } catch (error) {
      setFatalError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ----------------------------------------------------------- questionário
  const [quizActive, setQuizActive] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [pendingQuestions, setPendingQuestions] = useState<ProfileQuestion[]>([]);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const answeredCount = Object.keys(quizAnswers).length;
  const currentQuestion = pendingQuestions[0] ?? null;

  const startQuiz = useCallback(async () => {
    setQuizActive(true);
    setQuizAnswers({});
    setQuizError(null);
    setQuizBusy(true);
    try {
      const questions = await fetchProfileQuestions({});
      setPendingQuestions(questions);
      if (questions.length === 0) {
        const result = await assessProfile({});
        setAssessment(result);
        setQuizActive(false);
      }
    } catch (error) {
      setQuizError(errorMessage(error));
    } finally {
      setQuizBusy(false);
    }
  }, []);

  const answerQuestion = useCallback(
    async (question: ProfileQuestion, option: string) => {
      const nextAnswers = { ...quizAnswers, [question.id]: option };
      setQuizAnswers(nextAnswers);
      setQuizError(null);
      setQuizBusy(true);
      try {
        const questions = await fetchProfileQuestions(nextAnswers);
        if (questions.length > 0) {
          setPendingQuestions(questions);
        } else {
          const result = await assessProfile(nextAnswers);
          if (result.pending_questions.length > 0) {
            setPendingQuestions(result.pending_questions);
          } else {
            setAssessment(result);
            setPendingQuestions([]);
            setQuizActive(false);
          }
        }
      } catch (error) {
        setQuizError(errorMessage(error));
      } finally {
        setQuizBusy(false);
      }
    },
    [quizAnswers]
  );

  // ------------------------------------------------------------------- IPS
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [policyActionError, setPolicyActionError] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorVersionLabel, setEditorVersionLabel] = useState<string | null>(
    null
  );
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const refreshPolicy = useCallback(async () => {
    const [versionList, confirmedPolicy] = await Promise.all([
      fetchPolicyVersions(),
      fetchConfirmedPolicy(),
    ]);
    setVersions(versionList);
    setConfirmed(confirmedPolicy);
  }, []);

  const generateDraft = useCallback(
    async (content?: PolicyContent) => {
      setDraftBusy(true);
      setPolicyActionError(null);
      try {
        const draft = await draftPolicy({
          reason:
            reason.trim() ||
            (content
              ? "Edição manual da IPS pelo investidor"
              : "IPS derivada da última avaliação de perfil"),
          ...(author.trim() ? { author: author.trim() } : {}),
          ...(content ? { content } : {}),
        });
        setEditorText(JSON.stringify(draft.content, null, 2));
        setEditorVersionLabel(`v${draft.version} (rascunho)`);
        await refreshPolicy();
      } catch (error) {
        if (isApiError(error, "no_assessment")) {
          setPolicyActionError(
            "Não há avaliação de perfil registrada. Complete o questionário acima antes de gerar a IPS."
          );
        } else {
          setPolicyActionError(errorMessage(error));
        }
      } finally {
        setDraftBusy(false);
      }
    },
    [author, reason, refreshPolicy]
  );

  const saveEditorAsDraft = useCallback(() => {
    let parsed: PolicyContent;
    try {
      parsed = JSON.parse(editorText) as PolicyContent;
    } catch {
      setPolicyActionError(
        "O conteúdo do editor não é JSON válido. Corrija a sintaxe antes de salvar."
      );
      return;
    }
    void generateDraft(parsed);
  }, [editorText, generateDraft]);

  const handleConfirm = useCallback(
    async (versionId: number) => {
      setConfirmBusy(true);
      setPolicyActionError(null);
      try {
        await confirmPolicy(versionId);
        setConfirmingId(null);
        await refreshPolicy();
      } catch (error) {
        setPolicyActionError(errorMessage(error));
      } finally {
        setConfirmBusy(false);
      }
    },
    [refreshPolicy]
  );

  const loadIntoEditor = useCallback((version: PolicyVersion) => {
    setEditorText(JSON.stringify(version.content, null, 2));
    setEditorVersionLabel(
      `v${version.version} (${POLICY_STATUS_LABEL[version.status].toLowerCase()})`
    );
  }, []);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  // ---------------------------------------------------------------- render
  if (loading) return <PageSkeleton />;

  if (fatalError) {
    return (
      <div className="space-y-6">
        <ApiPageHeader
          icon={ScrollText}
          title="Perfil e Política (IPS)"
          description="Questionário adaptativo de perfil e Política de Investimentos versionada."
        />
        <ApiErrorState error={fatalError} onRetry={() => void loadAll()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ApiPageHeader
        icon={ScrollText}
        title="Perfil e Política (IPS)"
        description="Questionário adaptativo de perfil (scores por dimensão, sem rótulo único) e Política de Investimentos versionada com confirmação explícita."
      />

      {/* ----------------------------------------------------- questionário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden />
            Avaliação de perfil
          </CardTitle>
          <CardDescription>
            O backend seleciona as próximas perguntas conforme as respostas já
            dadas. O resultado é um conjunto de scores por dimensão — nunca um
            rótulo único de perfil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {quizError && (
            <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
              {quizError}
            </p>
          )}

          {quizActive && currentQuestion && (
            <div className="max-w-2xl space-y-3">
              <p className="text-xs text-muted-foreground">
                {answeredCount} resposta(s) enviada(s) ·{" "}
                {pendingQuestions.length} pergunta(s) pendente(s) segundo o
                backend
              </p>
              <Card className="border-border bg-surface-raised">
                <CardHeader>
                  <Badge variant="muted" className="w-fit">
                    {humanizeKey(currentQuestion.dimension)}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {dimensionInfo(currentQuestion.dimension)}
                  </p>
                  <CardTitle className="pt-1 text-lg leading-snug">
                    {currentQuestion.text}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={quizBusy}
                      onClick={() => void answerQuestion(currentQuestion, option)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      {option}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {quizActive && !currentQuestion && quizBusy && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Consultando próximas perguntas na API…
            </p>
          )}

          {!quizActive && assessment && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ConfidenceBadge value={assessment.confidence} />
                <span className="text-xs text-muted-foreground">
                  Avaliação{" "}
                  <span className="font-mono">{assessment.assessment_id}</span>
                  {assessment.created_at
                    ? ` · criada em ${formatDateTimeBR(assessment.created_at)}`
                    : ""}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(assessment.scores).map(([dimension, score]) => (
                  <div
                    key={dimension}
                    className="space-y-1.5 rounded-xl border border-border bg-surface-raised p-4"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {humanizeKey(dimension)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatNumber(score, Number.isInteger(score) ? 0 : 1)}
                      </span>
                    </div>
                    <Progress value={clamp(score, 0, 100)} />
                    <p className="text-xs text-muted-foreground/80">
                      {dimensionInfo(dimension)}
                    </p>
                  </div>
                ))}
                {Object.keys(assessment.scores).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    A API não retornou scores para esta avaliação.
                  </p>
                )}
              </div>

              {assessment.conflicts.length > 0 && (
                <div
                  role="alert"
                  className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4"
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
                    <ShieldAlert className="h-4 w-4" aria-hidden />
                    Conflitos detectados entre respostas
                  </p>
                  <ul className="list-inside list-disc text-sm text-amber-200/90">
                    {assessment.conflicts.map((conflict) => (
                      <li key={conflict}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-muted-foreground/70">
                Escala dos scores conforme reportada pelo backend. Metodologia:
                questionário adaptativo do Investment Intelligence OS
                (avaliação por dimensões, com detecção de conflitos).
              </p>

              <Button variant="outline" size="sm" onClick={() => void startQuiz()}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Refazer questionário
              </Button>
            </div>
          )}

          {!quizActive && !assessment && (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma avaliação de perfil ainda"
              description="Responda o questionário adaptativo para gerar os scores por dimensão. Sem avaliação, a IPS não pode ser derivada automaticamente."
            >
              <Button onClick={() => void startQuiz()} disabled={quizBusy}>
                <Play className="h-4 w-4" aria-hidden />
                Iniciar questionário
              </Button>
            </EmptyState>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- IPS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileEdit className="h-4 w-4 text-primary" aria-hidden />
            Política de Investimentos (IPS)
          </CardTitle>
          <CardDescription>
            Documento versionado com faixas por classe (mín/máx), limites,
            bandas e aporte mensal. Edite o rascunho como JSON e confirme para
            colocá-lo em vigor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            role="note"
            className="flex items-start gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted-foreground"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              Nenhuma recomendação ou plano de aportes é gerado antes da
              confirmação da IPS. Ao confirmar uma versão, ela passa a reger o
              rebalanceamento e as versões anteriores são marcadas como
              substituídas.
            </span>
          </div>

          {confirmed ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
              <BadgeCheck className="h-4 w-4 text-primary" aria-hidden />
              <span>
                IPS vigente: <strong>v{confirmed.version}</strong>, confirmada
                em {formatDateTimeBR(confirmed.confirmed_at)}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {confirmed.version_id}
              </span>
            </div>
          ) : (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-300">
              Nenhuma IPS confirmada até o momento — o plano de aportes
              permanece bloqueado.
            </p>
          )}

          {policyActionError && (
            <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
              {policyActionError}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="ips-reason">Motivo da nova versão</Label>
              <Input
                id="ips-reason"
                value={reason}
                placeholder="Ex.: revisão após nova avaliação de perfil"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ips-author">Autor (opcional)</Label>
              <Input
                id="ips-author"
                value={author}
                placeholder="Seu nome"
                onChange={(event) => setAuthor(event.target.value)}
              />
            </div>
            <Button
              onClick={() => void generateDraft()}
              disabled={draftBusy}
              className="sm:mb-0"
            >
              <FileEdit className="h-4 w-4" aria-hidden />
              {draftBusy ? "Gerando…" : "Gerar IPS (rascunho)"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Sem conteúdo no editor, o rascunho é derivado automaticamente da
            última avaliação de perfil pelo backend.
          </p>

          <Separator />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ips-editor">
                Editor da IPS{" "}
                {editorVersionLabel ? (
                  <span className="font-normal text-muted-foreground">
                    — carregada: {editorVersionLabel}
                  </span>
                ) : null}
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={saveEditorAsDraft}
                disabled={draftBusy || editorText.trim().length === 0}
              >
                Salvar edição como novo rascunho
              </Button>
            </div>
            <textarea
              id="ips-editor"
              value={editorText}
              onChange={(event) => setEditorText(event.target.value)}
              spellCheck={false}
              rows={14}
              placeholder="Gere um rascunho ou carregue uma versão do histórico para editar o JSON da IPS aqui (faixas por classe com mín/máx, limites, bandas, aporte mensal)…"
              className="w-full rounded-xl border border-border bg-surface-raised p-4 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-describedby="ips-editor-help"
            />
            <p id="ips-editor-help" className="text-xs text-muted-foreground/70">
              O conteúdo é validado e versionado pelo backend — salvar cria uma
              nova versão em rascunho, nunca sobrescreve versões anteriores.
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-primary" aria-hidden />
              Histórico de versões
            </p>
            {sortedVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma versão de IPS criada ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Versão</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Criada em</TableHead>
                    <TableHead scope="col">Autor</TableHead>
                    <TableHead scope="col">Motivo</TableHead>
                    <TableHead scope="col">Confirmada em</TableHead>
                    <TableHead scope="col" className="text-right">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVersions.map((version) => (
                    <TableRow key={version.version_id}>
                      <TableCell className="font-medium tabular-nums">
                        v{version.version}
                        {version.prev_version !== null &&
                          version.prev_version !== undefined && (
                            <span className="block text-[11px] text-muted-foreground/70">
                              anterior: {String(version.prev_version)}
                            </span>
                          )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={policyStatusVariant(version.status)}>
                          {POLICY_STATUS_LABEL[version.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTimeBR(version.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {version.author ?? <UnavailableValue label="—" />}
                      </TableCell>
                      <TableCell className="max-w-56 text-muted-foreground">
                        <span className="line-clamp-2" title={version.reason ?? ""}>
                          {version.reason ?? <UnavailableValue label="—" />}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {version.confirmed_at ? (
                          formatDateTimeBR(version.confirmed_at)
                        ) : (
                          <UnavailableValue label="—" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => loadIntoEditor(version)}
                          >
                            Carregar no editor
                          </Button>
                          {version.status === "draft" &&
                            (confirmingId === version.version_id ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={confirmBusy}
                                  onClick={() =>
                                    void handleConfirm(version.version_id)
                                  }
                                >
                                  <BadgeCheck className="h-4 w-4" aria-hidden />
                                  {confirmBusy
                                    ? "Confirmando…"
                                    : "Confirmar definitivamente"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={confirmBusy}
                                  onClick={() => setConfirmingId(null)}
                                >
                                  Cancelar
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setConfirmingId(version.version_id)
                                }
                              >
                                Confirmar IPS…
                              </Button>
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <MetaFooter
        fontes={["Investment Intelligence OS — módulos de perfil e política (API /v1)"]}
        entries={[
          {
            label: "Data-base",
            value: assessment?.created_at
              ? `avaliação de ${formatDateTimeBR(assessment.created_at)}`
              : "sem avaliação registrada",
          },
        ]}
      />
    </div>
  );
}
