"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  PiggyBank,
  Plus,
  Trash2,
  Unplug,
  Wallet,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  cashflowTotals,
  expensesByCategory,
  monthlyCashflow,
} from "@/lib/finance";
import type { TransactionType } from "@/lib/types";
import { cn, formatBRL, formatPercentPlain } from "@/lib/utils";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { OpenFinanceModal } from "@/components/open-finance-modal";

const EXPENSE_CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Contas",
  "Lazer",
  "Educação",
  "Outros",
];

const INCOME_CATEGORIES = ["Renda", "Investimentos", "Imóveis", "Outros"];

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function OrganizadorPage() {
  const {
    transactions,
    bankConnections,
    hydrated,
    addTransaction,
    removeTransaction,
    importOpenFinance,
    disconnectBank,
  } = useAppStore();

  const [type, setType] = useState<TransactionType>("despesa");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [formError, setFormError] = useState<string | null>(null);

  const totals = useMemo(() => cashflowTotals(transactions), [transactions]);
  const monthly = useMemo(() => monthlyCashflow(transactions, 6), [transactions]);
  const categories = useMemo(
    () => expensesByCategory(transactions),
    [transactions]
  );
  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30),
    [transactions]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!description.trim()) {
      setFormError("Informe uma descrição para o lançamento.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Informe um valor válido maior que zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError("Informe uma data válida.");
      return;
    }
    addTransaction({
      date,
      description: description.trim(),
      category,
      type,
      amount: Math.round(value * 100) / 100,
      source: "manual",
    });
    setDescription("");
    setAmount("");
    setFormError(null);
  };

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const availableCategories =
    type === "despesa" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet className="h-6 w-6 text-primary" />
            Organizador Financeiro
          </h1>
          <p className="text-sm text-muted-foreground">
            Receitas vs. despesas, categorias e contas conectadas via Open
            Finance.
          </p>
        </div>
        <OpenFinanceModal
          onConnected={importOpenFinance}
          connectedBankIds={bankConnections.map((c) => c.bankId)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receitas (período)"
          value={formatBRL(totals.receitas)}
          helper="Últimos 90 dias consolidados"
          icon={ArrowUpCircle}
          tone="profit"
        />
        <StatCard
          label="Despesas (período)"
          value={formatBRL(totals.despesas)}
          helper="Últimos 90 dias consolidados"
          icon={ArrowDownCircle}
          tone="loss"
        />
        <StatCard
          label="Saldo do período"
          value={formatBRL(totals.saldo)}
          icon={Wallet}
          tone={totals.saldo >= 0 ? "profit" : "loss"}
        />
        <StatCard
          label="Taxa de poupança"
          value={
            totals.taxaPoupanca !== null
              ? formatPercentPlain(totals.taxaPoupanca)
              : "—"
          }
          helper="Percentual da renda preservado"
          icon={PiggyBank}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fluxo de caixa mensal</CardTitle>
            <CardDescription>
              Receitas vs. despesas nos últimos 6 meses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CashflowChart data={monthly} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas conectadas</CardTitle>
              <CardDescription>
                {bankConnections.length === 0
                  ? "Nenhum banco conectado ainda"
                  : `${bankConnections.length} instituição(ões) via Open Finance`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {bankConnections.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Landmark className="h-4 w-4" />
                  Conecte um banco para importar saldos e transações
                  automaticamente.
                </p>
              ) : (
                bankConnections.map((connection) => (
                  <div
                    key={connection.bankId}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {connection.bankName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {connection.accountMask}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-profit">
                      {formatBRL(connection.balance)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Desconectar ${connection.bankName}`}
                      onClick={() => disconnectBank(connection.bankId)}
                    >
                      <Unplug className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Despesas por categoria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem despesas registradas no período.
                </p>
              ) : (
                categories.slice(0, 6).map((entry) => (
                  <div key={entry.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {entry.category}
                      </span>
                      <span className="tabular-nums">
                        {formatBRL(entry.value)}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {formatPercentPlain(entry.percent, 0)}
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={entry.percent}
                      indicatorClassName="bg-loss/70"
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo lançamento</CardTitle>
            <CardDescription>
              Registre manualmente receitas e despesas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setType("despesa");
                    setCategory(EXPENSE_CATEGORIES[0]);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                    type === "despesa"
                      ? "border-loss/40 bg-loss/10 text-loss"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType("receita");
                    setCategory(INCOME_CATEGORIES[0]);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                    type === "receita"
                      ? "border-profit/40 bg-profit/10 text-profit"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  Receita
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Input
                  id="descricao"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    type === "despesa" ? "Ex.: Supermercado" : "Ex.: Salário"
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="categoria">Categoria</Label>
                <select
                  id="categoria"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="flex h-9 w-full rounded-xl border border-border bg-surface-raised px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {availableCategories.map((option) => (
                    <option key={option} value={option} className="bg-surface-raised">
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="valor">Valor (R$)</Label>
                  <Input
                    id="valor"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="data">Data</Label>
                  <Input
                    id="data"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
              </div>

              {formError && <p className="text-xs text-loss">{formError}</p>}

              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4" />
                Adicionar lançamento
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lançamentos recentes</CardTitle>
            <CardDescription>
              {transactions.length} lançamento(s) no total — exibindo os 30 mais
              recentes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum lançamento ainda. Adicione manualmente ou conecte um
                banco via Open Finance.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(`${tx.date}T12:00:00`).toLocaleDateString(
                          "pt-BR"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {tx.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted">{tx.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {tx.source === "openfinance" ? (
                          <Badge variant="secondary">{tx.bank}</Badge>
                        ) : (
                          <Badge variant="outline">manual</Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          tx.type === "receita" ? "text-profit" : "text-loss"
                        )}
                      >
                        {tx.type === "receita" ? "+" : "−"}
                        {formatBRL(tx.amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Excluir ${tx.description}`}
                          onClick={() => removeTransaction(tx.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
