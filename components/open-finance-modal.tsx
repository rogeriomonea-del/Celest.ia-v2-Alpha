"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Landmark, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  CONNECTION_STEPS,
  OPEN_FINANCE_BANKS,
  generateMockStatement,
  type OpenFinanceBank,
} from "@/lib/api/open-finance";
import type { BankConnection, CashflowTransaction } from "@/lib/types";
import { cn, formatBRL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ModalStage = "select" | "consent" | "connecting" | "success";

interface OpenFinanceModalProps {
  onConnected: (
    connection: BankConnection,
    transactions: Array<Omit<CashflowTransaction, "id">>
  ) => void;
  connectedBankIds: string[];
}

const CONSENT_SCOPES = [
  "Saldos de contas de depósito à vista",
  "Extrato de transações dos últimos 90 dias",
  "Dados cadastrais básicos (nome e CPF mascarado)",
];

export function OpenFinanceModal({
  onConnected,
  connectedBankIds,
}: OpenFinanceModalProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<ModalStage>("select");
  const [selectedBank, setSelectedBank] = useState<OpenFinanceBank | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<BankConnection | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    setStage("select");
    setSelectedBank(null);
    setStepIndex(0);
    setResult(null);
  }, [clearTimers]);

  const startConnection = useCallback(() => {
    if (!selectedBank) return;
    setStage("connecting");
    setStepIndex(0);

    CONNECTION_STEPS.forEach((_, index) => {
      const timer = setTimeout(() => {
        setStepIndex(index + 1);
        if (index === CONNECTION_STEPS.length - 1) {
          const { connection, transactions } = generateMockStatement(selectedBank);
          setResult(connection);
          setStage("success");
          onConnected(connection, transactions);
        }
      }, 900 * (index + 1));
      timersRef.current.push(timer);
    });
  }, [selectedBank, onConnected]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Landmark className="h-4 w-4" />
          Conectar via Open Finance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {stage === "select" && (
          <>
            <DialogHeader>
              <DialogTitle>Conectar instituição</DialogTitle>
              <DialogDescription>
                Escolha o banco para importar saldos e transações via Open
                Finance Brasil. Ambiente de simulação — nenhum dado real é
                transmitido.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {OPEN_FINANCE_BANKS.map((bank) => {
                const alreadyConnected = connectedBankIds.includes(bank.id);
                return (
                  <button
                    key={bank.id}
                    type="button"
                    disabled={alreadyConnected}
                    onClick={() => {
                      setSelectedBank(bank);
                      setStage("consent");
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3 text-left transition-colors",
                      alreadyConnected
                        ? "cursor-not-allowed opacity-50"
                        : "hover:border-white/25 hover:bg-white/[0.03]"
                    )}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: bank.color }}
                    >
                      {bank.initials}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{bank.name}</span>
                      <span className="text-xs text-muted-foreground">
                        COMPE {bank.compe} ·{" "}
                        {alreadyConnected ? "já conectado" : "conta corrente"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {stage === "consent" && selectedBank && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Consentimento — {selectedBank.name}
              </DialogTitle>
              <DialogDescription>
                Você será autenticado no ambiente do banco. A celest.ia terá
                acesso somente de leitura aos escopos abaixo, por 12 meses.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2.5">
              {CONSENT_SCOPES.map((scope) => (
                <li key={scope} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{scope}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
              <LockKeyhole className="h-4 w-4 shrink-0 text-primary" />
              Conexão criptografada de ponta a ponta, regulada pelo Banco
              Central (Resolução Conjunta nº 1/2020).
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStage("select")}>
                Voltar
              </Button>
              <Button onClick={startConnection}>Autorizar acesso</Button>
            </div>
          </>
        )}

        {stage === "connecting" && selectedBank && (
          <>
            <DialogHeader>
              <DialogTitle>Conectando a {selectedBank.name}...</DialogTitle>
              <DialogDescription>
                Não feche esta janela durante a sincronização.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-3">
              {CONNECTION_STEPS.map((step, index) => {
                const isDone = stepIndex > index;
                const isCurrent = stepIndex === index;
                return (
                  <li key={step} className="flex items-center gap-3 text-sm">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-profit" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-white/15" />
                    )}
                    <span
                      className={cn(
                        isDone
                          ? "text-foreground"
                          : isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground/60"
                      )}
                    >
                      {step}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {stage === "success" && selectedBank && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-profit">
                <CheckCircle2 className="h-5 w-5" />
                Conexão estabelecida
              </DialogTitle>
              <DialogDescription>
                Transações dos últimos 90 dias importadas para o organizador.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-xl border border-white/10 bg-surface px-4 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: selectedBank.color }}
                >
                  {selectedBank.initials}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{result.bankName}</span>
                  <span className="text-xs text-muted-foreground">
                    {result.accountMask}
                  </span>
                </div>
              </div>
              <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Saldo disponível
                </span>
                <span className="text-lg font-semibold tabular-nums text-profit">
                  {formatBRL(result.balance)}
                </span>
              </div>
            </div>
            <Button
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Concluir
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
