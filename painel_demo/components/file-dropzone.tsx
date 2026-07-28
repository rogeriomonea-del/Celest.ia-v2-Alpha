"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { parsePortfolioFile } from "@/lib/api/parsers";
import type { ParsedPositionInput, ParseReport } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface FileDropzoneProps {
  onParsed: (positions: ParsedPositionInput[], report: ParseReport) => void;
  onError: (message: string) => void;
}

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json", ".txt"];

export function FileDropzone({ onParsed, onError }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setIsParsing(true);
      setLastFile(file.name);
      try {
        const { positions, report } = await parsePortfolioFile(file);
        if (positions.length === 0) {
          onError(
            report.warnings[0] ??
              "Nenhuma posição reconhecida no arquivo. Verifique as colunas de ativo, quantidade e preço médio."
          );
        } else {
          onParsed(positions, report);
        }
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message
            : "Falha inesperada ao processar o arquivo."
        );
      } finally {
        setIsParsing(false);
      }
    },
    [onParsed, onError]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Enviar arquivo de carteira"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
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
          if (file) void processFile(file);
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
        {isParsing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <UploadCloud className="h-5 w-5" />
        )}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {isParsing
            ? `Processando ${lastFile}...`
            : "Arraste o extrato da B3 ou da corretora"}
        </p>
        <p className="text-xs text-muted-foreground">
          .csv, .xlsx ou .json — colunas de ativo, quantidade e preço médio são
          detectadas automaticamente
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isParsing}
        className="pointer-events-none mt-1"
        tabIndex={-1}
      >
        <FileSpreadsheet className="h-4 w-4" />
        Selecionar arquivo
      </Button>
    </div>
  );
}
