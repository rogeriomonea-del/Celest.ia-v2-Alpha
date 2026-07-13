import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/api/brapi";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tickersParam = request.nextUrl.searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json(
      { error: "Parâmetro obrigatório ausente: tickers (ex.: ?tickers=PETR4,VALE3)" },
      { status: 400 }
    );
  }

  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 40);

  if (tickers.length === 0) {
    return NextResponse.json(
      { error: "Nenhum ticker válido informado." },
      { status: 400 }
    );
  }

  const response = await fetchQuotes(tickers);
  return NextResponse.json(response);
}
