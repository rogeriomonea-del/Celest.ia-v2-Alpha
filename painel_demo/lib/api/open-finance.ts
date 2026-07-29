import type { BankConnection, CashflowTransaction } from "@/lib/types";

export interface OpenFinanceBank {
  id: string;
  name: string;
  color: string;
  initials: string;
  compe: string;
}

export const OPEN_FINANCE_BANKS: OpenFinanceBank[] = [
  { id: "itau", name: "Itaú Unibanco", color: "#ec7000", initials: "IT", compe: "341" },
  { id: "bradesco", name: "Bradesco", color: "#cc092f", initials: "BR", compe: "237" },
  { id: "bb", name: "Banco do Brasil", color: "#f8d117", initials: "BB", compe: "001" },
  { id: "nubank", name: "Nubank", color: "#820ad1", initials: "NU", compe: "260" },
  { id: "santander", name: "Santander", color: "#ea1d25", initials: "SA", compe: "033" },
];

export const CONNECTION_STEPS = [
  "Redirecionando para o ambiente seguro do banco...",
  "Autenticando via OAuth 2.0 + FAPI (Open Finance Brasil)...",
  "Consentimento validado junto ao diretório central...",
  "Sincronizando saldos e transações dos últimos 90 dias...",
] as const;

interface TransactionTemplate {
  description: string;
  category: string;
  type: "receita" | "despesa";
  amount: number;
  dayOfMonth: number;
}

const MONTHLY_TEMPLATES: TransactionTemplate[] = [
  { description: "Salário", category: "Renda", type: "receita", amount: 12500, dayOfMonth: 5 },
  { description: "Dividendos e JCP", category: "Investimentos", type: "receita", amount: 842.37, dayOfMonth: 15 },
  { description: "Aluguel recebido", category: "Imóveis", type: "receita", amount: 2300, dayOfMonth: 10 },
  { description: "Aluguel apartamento", category: "Moradia", type: "despesa", amount: 3200, dayOfMonth: 8 },
  { description: "Condomínio", category: "Moradia", type: "despesa", amount: 980, dayOfMonth: 8 },
  { description: "Supermercado", category: "Alimentação", type: "despesa", amount: 1650.45, dayOfMonth: 12 },
  { description: "Energia elétrica", category: "Contas", type: "despesa", amount: 312.9, dayOfMonth: 18 },
  { description: "Internet fibra", category: "Contas", type: "despesa", amount: 129.9, dayOfMonth: 18 },
  { description: "Plano de saúde", category: "Saúde", type: "despesa", amount: 1180, dayOfMonth: 20 },
  { description: "Combustível", category: "Transporte", type: "despesa", amount: 540.2, dayOfMonth: 22 },
  { description: "Restaurantes e delivery", category: "Alimentação", type: "despesa", amount: 720.65, dayOfMonth: 25 },
  { description: "Streaming e assinaturas", category: "Lazer", type: "despesa", amount: 112.7, dayOfMonth: 27 },
  { description: "Academia", category: "Saúde", type: "despesa", amount: 159.9, dayOfMonth: 28 },
];

function isoDate(year: number, month: number, day: number): string {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

function variation(base: number, monthIndex: number, salt: number): number {
  const wave = Math.sin((monthIndex + 1) * (salt + 2.7)) * 0.12;
  return Math.round(base * (1 + wave) * 100) / 100;
}

export function generateMockStatement(
  bank: OpenFinanceBank,
  months = 3
): {
  connection: BankConnection;
  transactions: Array<Omit<CashflowTransaction, "id">>;
} {
  const now = new Date();
  const transactions: Array<Omit<CashflowTransaction, "id">> = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    MONTHLY_TEMPLATES.forEach((template, index) => {
      const date = isoDate(ref.getFullYear(), ref.getMonth(), template.dayOfMonth);
      if (new Date(date) > now) return;
      transactions.push({
        date,
        description: template.description,
        category: template.category,
        type: template.type,
        amount: variation(template.amount, offset, index),
        source: "openfinance",
        bank: bank.name,
      });
    });
  }

  const receitas = transactions
    .filter((t) => t.type === "receita")
    .reduce((acc, t) => acc + t.amount, 0);
  const despesas = transactions
    .filter((t) => t.type === "despesa")
    .reduce((acc, t) => acc + t.amount, 0);
  const balance = Math.round((18450.32 + (receitas - despesas) * 0.6) * 100) / 100;

  const connection: BankConnection = {
    bankId: bank.id,
    bankName: bank.name,
    connectedAt: new Date().toISOString(),
    accountMask: `Ag. 0001 · CC ****${bank.compe}8`,
    balance,
  };

  return { connection, transactions };
}
