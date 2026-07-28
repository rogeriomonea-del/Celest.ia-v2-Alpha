"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileUp,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { formatNumber, formatQuantity } from "@/lib/utils";
import {
  confirmImport,
  correctImportRow,
  errorMessage,
  excludedRowsCount,
  fetchImportPreview,
  importPortfolio,
  isApiError,
  isUnreachableError,
  type AssetClassApi,
  type ImportConfirmResult,
  type ImportPreview,
  type ImportRow,
  resolutionToLabel,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  NativeSelect,
  UnavailableValue,
  formatDateBR,
} from "@/components/investment-os/shared";
import { UploadDropzone } from "@/components/investment-os/upload-dropzone";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROW_STATUS_LABEL: Record<ImportRow["status"], string> = {
  ok: "OK",
  ambiguous: "Ambígua",
  unknown: "Desconhecida",
  rejected: "Rejeitada",
  duplicate: "Duplicada",
};

function rowStatusVariant(
  status: ImportRow["status"]
): "default" | "warning" | "destructive" | "muted" {
  switch (status) {
    case "ok":
      return "default";
    case "ambiguous":
    case "unknown":
      return "warning";
    case "rejected":
      return "destructive";
    default:
      return "muted";
  }
}

const COUNT_LABEL: Record<string, string> = {
  ok: "OK",
  ambiguous: "Ambíguas",
  unknown: "Desconhecidas",
  rejected: "Rejeitadas",
  duplicate: "Duplicadas",
};

const ASSET_CLASS_OPTIONS: Array<{ value: AssetClassApi; label: string }> = [
  { value: "acao_br", label: "Ação BR" },
  { value: "fii", label: "FII" },
  { value: "bdr", label: "BDR" },
  { value: "etf", label: "ETF" },
  { value: "renda_fixa", label: "Renda fixa" },
  { value: "outro", label: "Outro" },
];

interface CorrectionDraft {
  ticker: string;
  assetClass: "" | AssetClassApi;
}

export default function ImportacaoPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [corrections, setCorrections] = useState<Record<string, CorrectionDraft>>(
    {}
  );
  const [correctingRowId, setCorrectingRowId] = useState<number | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const [acceptPartial, setAcceptPartial] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportConfirmResult | null>(null);

  const problemRows = useMemo(
    () => (preview ? preview.rows.filter((row) => row.status !== "ok") : []),
    [preview]
  );

  const reset = useCallback(() => {
    setPreview(null);
    setResult(null);
    setUploadError(null);
    setCorrections({});
    setCorrectionError(null);
    setConfirmError(null);
    setAcceptPartial(false);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setResult(null);
    setConfirmError(null);
    setCorrectionError(null);
    setAcceptPartial(false);
    try {
      const previewResponse = await importPortfolio(file);
      setPreview(previewResponse);
    } catch (error) {
      setPreview(null);
      setUploadError(error);
    } finally {
      setUploading(false);
    }
  }, []);

  const refreshPreview = useCallback(async () => {
    if (!preview) return;
    setRefreshing(true);
    try {
      setPreview(await fetchImportPreview(preview.import_id));
    } catch (error) {
      setUploadError(error);
    } finally {
      setRefreshing(false);
    }
  }, [preview]);

  const submitCorrection = useCallback(
    async (row: ImportRow) => {
      if (!preview) return;
      const draft = corrections[row.row_id] ?? {
        ticker: row.ticker ?? "",
        assetClass: "" as const,
      };
      if (!draft.ticker.trim()) {
        setCorrectionError("Informe o ticker para corrigir a linha.");
        return;
      }
      setCorrectingRowId(row.row_id);
      setCorrectionError(null);
      try {
        const updated = await correctImportRow(preview.import_id, row.row_id, {
          ticker: draft.ticker.trim().toUpperCase(),
          ...(draft.assetClass ? { asset_class: draft.assetClass } : {}),
        });
        setPreview(updated);
      } catch (error) {
        setCorrectionError(errorMessage(error));
      } finally {
        setCorrectingRowId(null);
      }
    },
    [corrections, preview]
  );

  const handleConfirm = useCallback(async () => {
    if (!preview) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const confirmResult = await confirmImport(
        preview.import_id,
        problemRows.length > 0 ? acceptPartial : false
      );
      setResult(confirmResult);
    } catch (error) {
      if (isApiError(error, "confirm_rejected")) {
        setConfirmError(
          "A confirmação foi recusada: há linhas com problemas. Corrija as linhas ambíguas/desconhecidas ou marque a aceitação de importação parcial."
        );
      } else {
        setConfirmError(errorMessage(error));
      }
    } finally {
      setConfirming(false);
    }
  }, [acceptPartial, preview, problemRows.length]);

  const updateCorrection = useCallback(
    (row: ImportRow, patch: Partial<CorrectionDraft>) => {
      setCorrections((current) => ({
        ...current,
        [row.row_id]: {
          ticker: current[row.row_id]?.ticker ?? row.ticker ?? "",
          assetClass: current[row.row_id]?.assetClass ?? "",
          ...patch,
        },
      }));
    },
    []
  );

  return (
    <div className="space-y-6">
      <ApiPageHeader
        icon={FileUp}
        title="Importação B3"
        description="Envie o extrato de posição da B3/corretora (.xlsx ou .csv). O backend interpreta, remove PII, aponta linhas problemáticas e só cria o snapshot após a sua confirmação."
      />

      {/* ------------------------------------------------------------ upload */}
      {!result && (
        <UploadDropzone
          busy={uploading}
          onFile={(file) => void handleFile(file)}
          onValidationError={(message) =>
            setUploadError(new Error(message))
          }
        />
      )}

      {uploadError !== null &&
      !isUnreachableError(uploadError) &&
      !isApiError(uploadError) ? (
        <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {errorMessage(uploadError)}
        </p>
      ) : null}
      {isUnreachableError(uploadError) || isApiError(uploadError) ? (
        <ApiErrorState
          error={uploadError}
          title={
            isApiError(uploadError, "file_too_large")
              ? "Arquivo acima do limite de 10 MB"
              : isApiError(uploadError, "import_invalid")
                ? "Arquivo inválido para importação"
                : undefined
          }
          onRetry={() => setUploadError(null)}
        />
      ) : null}

      {!preview && !result && !uploadError && !uploading && (
        <p className="text-sm text-muted-foreground">
          Nenhuma importação em andamento. Envie um arquivo para ver a prévia —
          nada é gravado sem a sua confirmação explícita.
        </p>
      )}

      {/* ----------------------------------------------------------- prévia */}
      {preview && !result && (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Prévia da importação</CardTitle>
                <CardDescription>
                  Import <span className="font-mono">{preview.import_id}</span> ·
                  status: {preview.status} · adaptador: {preview.adapter}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshPreview()}
                disabled={refreshing}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                {refreshing ? "Atualizando…" : "Recarregar prévia"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground/80">
                    Data-base:
                  </span>{" "}
                  {formatDateBR(preview.data_base)}
                </span>
                <span>
                  <span className="font-medium text-foreground/80">SHA-256:</span>{" "}
                  <span className="font-mono" title={preview.file_sha256}>
                    {preview.file_sha256.slice(0, 16)}…
                  </span>
                </span>
              </div>

              <div
                className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm"
                role="status"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  PII removida: {preview.pii_removed_count} ocorrência(s) — CPF,
                  nome e conta não chegam ao restante do sistema.
                </span>
              </div>

              <div className="flex flex-wrap gap-2" aria-label="Contagem de linhas por status">
                {Object.entries(preview.counts).map(([key, count]) => (
                  <Badge
                    key={key}
                    variant={rowStatusVariant(key as ImportRow["status"])}
                  >
                    {COUNT_LABEL[key] ?? key}: {count}
                  </Badge>
                ))}
              </div>

              {correctionError && (
                <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
                  {correctionError}
                </p>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">#</TableHead>
                    <TableHead scope="col">Ticker</TableHead>
                    <TableHead scope="col" className="text-right">
                      Quantidade
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Custo médio
                    </TableHead>
                    <TableHead scope="col">Moeda</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Motivo</TableHead>
                    <TableHead scope="col" className="text-right">
                      Confiança
                    </TableHead>
                    <TableHead scope="col">Correção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => {
                    const needsCorrection =
                      row.status === "ambiguous" || row.status === "unknown";
                    const draft = corrections[row.row_id];
                    return (
                      <TableRow key={row.row_id}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.row_index}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.ticker ?? <UnavailableValue label="—" />}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity !== null ? (
                            formatQuantity(row.quantity)
                          ) : (
                            <UnavailableValue />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.cost_status === "desconhecido" ||
                          row.avg_cost === null ? (
                            <UnavailableValue label="desconhecido" />
                          ) : (
                            formatNumber(row.avg_cost)
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.currency ?? <UnavailableValue label="—" />}
                        </TableCell>
                        <TableCell>
                          <Badge variant={rowStatusVariant(row.status)}>
                            {ROW_STATUS_LABEL[row.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-52 text-xs text-muted-foreground">
                          <span className="line-clamp-2" title={row.reason ?? ""}>
                            {row.reason ?? "—"}
                          </span>
                          {resolutionToLabel(row.resolution) && (
                            <span className="mt-0.5 block text-[11px] text-primary/90">
                              Resolução: {resolutionToLabel(row.resolution)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {row.confidence ?? <UnavailableValue label="—" />}
                        </TableCell>
                        <TableCell>
                          {needsCorrection ? (
                            <div className="flex min-w-64 flex-wrap items-center gap-2">
                              <div className="w-28">
                                <Label
                                  htmlFor={`ticker-${row.row_id}`}
                                  className="sr-only"
                                >
                                  Ticker corrigido para a linha {row.row_index}
                                </Label>
                                <Input
                                  id={`ticker-${row.row_id}`}
                                  className="h-8 text-xs uppercase"
                                  placeholder="TICKER"
                                  value={draft?.ticker ?? row.ticker ?? ""}
                                  onChange={(event) =>
                                    updateCorrection(row, {
                                      ticker: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="w-32">
                                <Label
                                  htmlFor={`class-${row.row_id}`}
                                  className="sr-only"
                                >
                                  Classe do ativo para a linha {row.row_index}
                                </Label>
                                <NativeSelect
                                  id={`class-${row.row_id}`}
                                  className="h-8 text-xs"
                                  value={draft?.assetClass ?? ""}
                                  onChange={(event) =>
                                    updateCorrection(row, {
                                      assetClass: event.target
                                        .value as CorrectionDraft["assetClass"],
                                    })
                                  }
                                >
                                  <option value="">Classe (opcional)</option>
                                  {ASSET_CLASS_OPTIONS.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={correctingRowId === row.row_id}
                                onClick={() => void submitCorrection(row)}
                              >
                                <Wrench className="h-3.5 w-3.5" aria-hidden />
                                {correctingRowId === row.row_id
                                  ? "Corrigindo…"
                                  : "Corrigir"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* -------------------------------------------------- confirmação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confirmação</CardTitle>
              <CardDescription>
                O snapshot da carteira só é criado após esta confirmação
                explícita.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {problemRows.length > 0 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={acceptPartial}
                    onChange={(event) => setAcceptPartial(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border bg-surface accent-emerald-500"
                  />
                  <span>
                    Aceitar importação parcial ({problemRows.length} linha(s)
                    excluída(s)) — linhas ambíguas, desconhecidas, rejeitadas ou
                    duplicadas ficarão fora do snapshot.
                  </span>
                </label>
              )}

              {confirmError && (
                <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
                  {confirmError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void handleConfirm()}
                  disabled={
                    confirming || (problemRows.length > 0 && !acceptPartial)
                  }
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {confirming ? "Confirmando…" : "Confirmar importação"}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={confirming}>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Descartar e recomeçar
                </Button>
                {problemRows.length > 0 && !acceptPartial && (
                  <span className="text-xs text-muted-foreground">
                    Corrija as linhas com problema ou aceite a importação
                    parcial para habilitar a confirmação.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* --------------------------------------------------------- resultado */}
      {result && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-col items-start gap-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="font-medium">
                  {result.idempotent
                    ? "Importação idempotente — este arquivo já havia sido importado"
                    : "Snapshot da carteira criado com sucesso"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Snapshot <span className="font-mono">{result.snapshot_id}</span>{" "}
                  · versão {result.version}
                  {excludedRowsCount(result.excluded_rows) > 0 &&
                    ` · ${excludedRowsCount(result.excluded_rows)} linha(s) excluída(s) na importação parcial`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/carteira">
                  Ver carteira
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Nova importação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
