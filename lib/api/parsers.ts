import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { AssetClass, ParsedPositionInput, ParseReport } from "@/lib/types";
import { ASSET_CLASSES } from "@/lib/types";

export interface ParseOutcome {
  positions: ParsedPositionInput[];
  report: ParseReport;
}

type RawRow = Record<string, unknown>;

interface ColumnMap {
  ticker: string | null;
  name: string | null;
  quantity: string | null;
  averagePrice: string | null;
  totalValue: string | null;
  assetClass: string | null;
}

const TICKER_ALIASES = [
  "ticker",
  "ativo",
  "papel",
  "codigo",
  "código",
  "codigo de negociacao",
  "código de negociação",
  "cod. de negociação",
  "produto",
  "symbol",
  "acao",
  "ação",
  "fundo",
];

const NAME_ALIASES = [
  "nome",
  "empresa",
  "descricao",
  "descrição",
  "razao social",
  "razão social",
  "instituicao",
  "name",
];

const QUANTITY_ALIASES = [
  "quantidade",
  "qtd",
  "qtde",
  "qtd.",
  "quantidade disponivel",
  "quantidade disponível",
  "quantity",
  "cotas",
  "posicao",
  "posição",
];

const AVG_PRICE_ALIASES = [
  "preco medio",
  "preço médio",
  "pm",
  "preco medio de compra",
  "preço médio de compra",
  "preco de compra",
  "preço de compra",
  "average price",
  "custo medio",
  "custo médio",
  "preco",
  "preço",
];

const TOTAL_VALUE_ALIASES = [
  "valor total",
  "total",
  "valor investido",
  "valor aplicado",
  "valor",
  "posicao total",
  "posição total",
  "total value",
  "valor atualizado",
];

const CLASS_ALIASES = [
  "classe",
  "classe de ativo",
  "tipo",
  "tipo de ativo",
  "categoria",
  "asset class",
  "class",
];

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 .]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchColumn(headers: string[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const alias of normalizedAliases) {
    const exact = headers.find((h) => normalizeHeader(h) === alias);
    if (exact) return exact;
  }
  for (const alias of normalizedAliases) {
    const partial = headers.find((h) => normalizeHeader(h).includes(alias));
    if (partial) return partial;
  }
  return null;
}

function detectColumns(headers: string[]): ColumnMap {
  return {
    ticker: matchColumn(headers, TICKER_ALIASES),
    name: matchColumn(headers, NAME_ALIASES),
    quantity: matchColumn(headers, QUANTITY_ALIASES),
    averagePrice: matchColumn(headers, AVG_PRICE_ALIASES),
    totalValue: matchColumn(headers, TOTAL_VALUE_ALIASES),
    assetClass: matchColumn(headers, CLASS_ALIASES),
  };
}

export function parseBrazilianNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;

  let text = raw
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .replace(/%$/, "")
    .trim();

  if (text === "" || text === "-" || text === "–") return null;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const dotParts = text.split(".");
    const lastPart = dotParts[dotParts.length - 1];
    if (dotParts.length > 2 || (dotParts.length === 2 && lastPart.length === 3 && dotParts[0].length <= 3)) {
      const asThousands = text.replace(/\./g, "");
      if (/^\d+$/.test(asThousands)) text = asThousands;
    }
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function extractTicker(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).toUpperCase().trim();
  const b3Match = text.match(/\b([A-Z]{4}\d{1,2}[BF]?)\b/);
  if (b3Match) return b3Match[1];
  const fixedIncomeMatch = text.match(
    /\b(TESOURO|SELIC|IPCA|CDB|LCI|LCA|LFT|LTN|NTN-?[BF]?)\b/
  );
  if (fixedIncomeMatch) {
    return text.replace(/[^A-Z0-9+ -]/g, "").slice(0, 24).trim();
  }
  if (/^[A-Z0-9]{4,10}$/.test(text)) return text;
  return null;
}

function normalizeAssetClass(raw: unknown): AssetClass | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = normalizeHeader(raw);
  const directMatch = ASSET_CLASSES.find(
    (c) => normalizeHeader(c) === normalized
  );
  if (directMatch) return directMatch;
  if (/(acao|acoes|stock)/.test(normalized)) return "Ações";
  if (/(fii|fundo imobiliario|imobiliario)/.test(normalized)) return "FIIs";
  if (/(renda fixa|tesouro|cdb|lci|lca|fixed)/.test(normalized)) return "Renda Fixa";
  if (/etf/.test(normalized)) return "ETFs";
  if (/bdr/.test(normalized)) return "BDRs";
  if (/(caixa|cash|conta)/.test(normalized)) return "Caixa";
  return undefined;
}

function rowsToPositions(
  rows: RawRow[],
  columns: ColumnMap,
  warnings: string[]
): { positions: ParsedPositionInput[]; skipped: number } {
  const positions: ParsedPositionInput[] = [];
  let skipped = 0;

  for (const row of rows) {
    const tickerRaw = columns.ticker ? row[columns.ticker] : undefined;
    const ticker = extractTicker(tickerRaw);
    if (!ticker) {
      skipped += 1;
      continue;
    }

    const quantity = columns.quantity
      ? parseBrazilianNumber(row[columns.quantity])
      : null;
    const averagePrice = columns.averagePrice
      ? parseBrazilianNumber(row[columns.averagePrice])
      : null;
    const totalValue = columns.totalValue
      ? parseBrazilianNumber(row[columns.totalValue])
      : null;

    let resolvedQuantity = quantity;
    let resolvedAvgPrice = averagePrice;

    if ((resolvedQuantity === null || resolvedQuantity <= 0) && totalValue !== null && resolvedAvgPrice !== null && resolvedAvgPrice > 0) {
      resolvedQuantity = totalValue / resolvedAvgPrice;
    }
    if ((resolvedAvgPrice === null || resolvedAvgPrice <= 0) && totalValue !== null && resolvedQuantity !== null && resolvedQuantity > 0) {
      resolvedAvgPrice = totalValue / resolvedQuantity;
    }

    if (
      resolvedQuantity === null ||
      resolvedQuantity <= 0 ||
      resolvedAvgPrice === null ||
      resolvedAvgPrice <= 0
    ) {
      skipped += 1;
      warnings.push(
        `Linha ignorada (${ticker}): quantidade ou preço médio ausente/inválido.`
      );
      continue;
    }

    const name =
      columns.name && typeof row[columns.name] === "string"
        ? String(row[columns.name]).trim()
        : undefined;

    positions.push({
      ticker,
      name: name && name.length > 1 ? name : undefined,
      quantity: Number(resolvedQuantity.toFixed(6)),
      averagePrice: Number(resolvedAvgPrice.toFixed(6)),
      totalValue: totalValue ?? undefined,
      assetClass: columns.assetClass
        ? normalizeAssetClass(row[columns.assetClass])
        : undefined,
    });
  }

  return { positions, skipped };
}

function consolidateDuplicates(
  positions: ParsedPositionInput[]
): ParsedPositionInput[] {
  const byTicker = new Map<string, ParsedPositionInput>();
  for (const position of positions) {
    const existing = byTicker.get(position.ticker);
    if (!existing) {
      byTicker.set(position.ticker, { ...position });
      continue;
    }
    const totalQuantity = existing.quantity + position.quantity;
    const blendedPrice =
      (existing.quantity * existing.averagePrice +
        position.quantity * position.averagePrice) /
      totalQuantity;
    byTicker.set(position.ticker, {
      ...existing,
      quantity: Number(totalQuantity.toFixed(6)),
      averagePrice: Number(blendedPrice.toFixed(6)),
    });
  }
  return Array.from(byTicker.values());
}

function buildReport(
  fileName: string,
  format: ParseReport["format"],
  rowsRead: number,
  positions: ParsedPositionInput[],
  skipped: number,
  columns: ColumnMap,
  warnings: string[]
): ParseReport {
  const detectedColumns: Record<string, string> = {};
  if (columns.ticker) detectedColumns["Ativo"] = columns.ticker;
  if (columns.name) detectedColumns["Nome"] = columns.name;
  if (columns.quantity) detectedColumns["Quantidade"] = columns.quantity;
  if (columns.averagePrice) detectedColumns["Preço médio"] = columns.averagePrice;
  if (columns.totalValue) detectedColumns["Valor total"] = columns.totalValue;
  if (columns.assetClass) detectedColumns["Classe"] = columns.assetClass;

  return {
    fileName,
    format,
    rowsRead,
    positionsParsed: positions.length,
    skippedRows: skipped,
    detectedColumns,
    warnings: warnings.slice(0, 8),
  };
}

function parseRows(
  fileName: string,
  format: ParseReport["format"],
  rows: RawRow[]
): ParseOutcome {
  const warnings: string[] = [];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const columns = detectColumns(headers);

  if (!columns.ticker) {
    warnings.push(
      "Nenhuma coluna de ativo/ticker foi identificada nos cabeçalhos do arquivo."
    );
    return {
      positions: [],
      report: buildReport(fileName, format, rows.length, [], rows.length, columns, warnings),
    };
  }
  if (!columns.quantity) {
    warnings.push("Coluna de quantidade não identificada — tentando derivar do valor total.");
  }
  if (!columns.averagePrice) {
    warnings.push("Coluna de preço médio não identificada — tentando derivar do valor total.");
  }

  const { positions: rawPositions, skipped } = rowsToPositions(rows, columns, warnings);
  const positions = consolidateDuplicates(rawPositions);
  if (positions.length < rawPositions.length) {
    warnings.push(
      `${rawPositions.length - positions.length} linha(s) duplicada(s) consolidada(s) por preço médio ponderado.`
    );
  }

  return {
    positions,
    report: buildReport(fileName, format, rows.length, positions, skipped, columns, warnings),
  };
}

async function parseCsv(file: File): Promise<ParseOutcome> {
  const text = await file.text();
  const delimiter = text.split("\n")[0]?.includes(";") ? ";" : ",";
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter,
    transformHeader: (h) => h.trim(),
  });

  const rows = result.data.filter(
    (row) => row && Object.values(row).some((v) => v !== null && v !== "")
  );
  return parseRows(file.name, "csv", rows);
}

async function parseXlsx(file: File): Promise<ParseOutcome> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      positions: [],
      report: buildReport(file.name, "xlsx", 0, [], 0, detectColumns([]), [
        "Planilha vazia ou ilegível.",
      ]),
    };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  return parseRows(file.name, "xlsx", rows);
}

async function parseJson(file: File): Promise<ParseOutcome> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      positions: [],
      report: buildReport(file.name, "json", 0, [], 0, detectColumns([]), [
        "JSON inválido — não foi possível interpretar o arquivo.",
      ]),
    };
  }

  const rows: RawRow[] = Array.isArray(parsed)
    ? (parsed as RawRow[])
    : typeof parsed === "object" && parsed !== null
      ? (Object.values(parsed as Record<string, unknown>).find(Array.isArray) as RawRow[] | undefined) ?? []
      : [];

  const normalizedRows = rows.filter(
    (row): row is RawRow => typeof row === "object" && row !== null
  );
  return parseRows(file.name, "json", normalizedRows);
}

export async function parsePortfolioFile(file: File): Promise<ParseOutcome> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "csv" || extension === "txt") return parseCsv(file);
  if (extension === "xlsx" || extension === "xls") return parseXlsx(file);
  if (extension === "json") return parseJson(file);
  throw new Error(
    `Formato ".${extension}" não suportado. Envie arquivos .csv, .xlsx ou .json.`
  );
}
