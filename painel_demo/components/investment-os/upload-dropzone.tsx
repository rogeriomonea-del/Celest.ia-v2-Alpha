"use client";

/**
 * Dropzone de upload para a importação B3 via API do backend.
 * Diferente de `components/file-dropzone.tsx` (que parseia localmente no
 * protótipo), este componente NÃO interpreta o arquivo: apenas valida
 * extensão/tamanho e entrega o `File` bruto para envio multipart à API.
 */

import { useCallback, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMPORT_MAX_FILE_BYTES } from "@/lib/api/investment-os";
import { Button } from "@/components/ui/button";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  onValidationError: (message: string) => void;
  busy: boolean;
  busyLabel?: string;
}

export function UploadDropzone({
  onFile,
  onValidationError,
  busy,
  busyLabel,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const lower = file.name.toLowerCase();
      const validExtension = ACCEPTED_EXTENSIONS.some((ext) =>
        lower.endsWith(ext)
      );
      if (!validExtension) {
        onValidationError(
          `Formato não suportado (${file.name}). Envie um arquivo .xlsx ou .csv exportado da B3/corretora.`
        );
        return;
      }
      if (file.size > IMPORT_MAX_FILE_BYTES) {
        onValidationError(
          `Arquivo excede o limite de 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB). Reduza o período do extrato e tente novamente.`
        );
        return;
      }
      setLastFile(file.name);
      onFile(file);
    },
    [onFile, onValidationError]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (busy) return;
      const file = event.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [busy, handleFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Enviar arquivo da B3 para importação (xlsx ou csv, máximo 10 MB)"
      aria-disabled={busy}
      onClick={() => {
        if (!busy) inputRef.current?.click();
      }}
      onKeyDown={(event) => {
        if (busy) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
        busy && "pointer-events-auto cursor-wait opacity-80",
        isDragging
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-surface hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = "";
        }}
      />

      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl ring-1 transition-colors",
          isDragging
            ? "bg-primary/15 text-primary ring-primary/30"
            : "bg-slate-100 text-muted-foreground ring-slate-200 group-hover:text-foreground"
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <UploadCloud className="h-5 w-5" aria-hidden />
        )}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {busy
            ? (busyLabel ?? `Enviando ${lastFile ?? "arquivo"} para a API…`)
            : "Arraste o extrato da B3 (posição consolidada)"}
        </p>
        <p className="text-xs text-muted-foreground">
          .xlsx ou .csv, máximo 10 MB — o arquivo é processado pelo backend, que
          remove PII antes de qualquer análise
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        className="pointer-events-none mt-1"
        tabIndex={-1}
      >
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        Selecionar arquivo
      </Button>
    </div>
  );
}
