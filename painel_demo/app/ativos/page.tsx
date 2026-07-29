"use client";

/**
 * Banco de Ativos B3 (Fase 7): universo completo do registro gold do backend
 * (GET /v1/ativos), com busca, filtro por tipo, paginação e cotação
 * intradiária sob demanda (GET /v1/ativos/{ticker}/intradiario).
 *
 * Regras: a classificação de tipo é HEURÍSTICA (selo de confiança sempre
 * visível); fechamentos B3 NÃO são ajustados por proventos; cotação
 * intradiária vem de AGREGADOR (indicativa, nunca usável em cálculos); 503 do
 * intradiário exibe o fechamento oficial D-1 como fallback SEM esconder o erro.
 */

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  Info,
  Search,
  Zap,
} from "lucide-react";
import { cn, formatBRL, formatPercent } from "@/lib/utils";
import {
  errorMessage,
  fetchAtivoIntradiario,
  fetchAtivos,
  isApiError,
  type AtivoB3,
  type AtivoIntradiario,
  type AtivosPage,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  ConfidenceBadge,
  EmptyState,
  MetaFooter,
  PageSkeleton,
  UnavailableValue,
  formatDateBR,
  formatDateTimeBR,
  humanizeKey,
} from "@/components/investment-os/shared";
import { StatCard } from "@/components/stat-card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_DESCRIPTION =
  "Universo completo de ativos listados na B3 segundo o registro do backend: ticker, tipo (classificação heurística com selo de confiança), especificação, último pregão e fechamento oficial não ajustado por proventos.";

const LIMITE_POR_PAGINA = 50;

/** Rótulos exibíveis das chaves de `tipos` retornadas pela API. */
const TIPO_LABELS: Record<string, string> = {
  acao_br: "Ações BR",
  fii: "FIIs",
  bdr: "BDRs",
  etf_ou_fundo: "ETFs/Fundos",
  unit: "Units",
};

function tipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] ?? humanizeKey(tipo);
}

interface IntradiarioState {
  loading: boolean;
  data: AtivoIntradiario | null;
  error: unknown;
}

function TipoChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border bg-surface-raised text-muted-foreground hover:bg-slate-100 hover:text-foreground"
      )}
    >
      {label}
      {count !== null && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
            active ? "bg-primary/20" : "bg-slate-200"
          )}
        >
          {count.toLocaleString("pt-BR")}
        </span>
      )}
    </button>
  );
}

/** Resultado do intradiário exibido numa linha extra abaixo do ativo. */
function IntradiarioResult({
  ativo,
  state,
  fonteOficialLista,
  onRetry,
}: {
  ativo: AtivoB3;
  state: IntradiarioState;
  fonteOficialLista: string;
  onRetry: () => void;
}) {
  if (state.loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-96" />
        <span className="sr-only">
          Consultando cotação intradiária de {ativo.ticker}…
        </span>
      </div>
    );
  }

  if (state.error !== null && state.error !== undefined) {
    const indisponivel = isApiError(state.error, "intradiario_indisponivel");
    return (
      <div className="space-y-3" role="alert">
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
            aria-hidden
          />
          <div>
            <p className="font-medium">
              {indisponivel
                ? "Cotação intradiária indisponível"
                : "Erro ao consultar a cotação intradiária"}
            </p>
            <p className="text-xs text-muted-foreground">
              {errorMessage(state.error)}
              {isApiError(state.error) && (
                <>
                  {" "}
                  (código:{" "}
                  <span className="font-mono">{state.error.code}</span> · HTTP{" "}
                  {state.error.status})
                </>
              )}
            </p>
          </div>
        </div>

        {indisponivel && (
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Fallback — fechamento oficial D-1
            </p>
            <p className="mt-1 tabular-nums">
              {ativo.ultimo_fechamento !== null ? (
                <span className="font-semibold">
                  {formatBRL(ativo.ultimo_fechamento)}
                </span>
              ) : (
                <UnavailableValue />
              )}{" "}
              <span className="text-xs text-muted-foreground">
                no pregão de {formatDateBR(ativo.ultimo_pregao)} · não ajustado
                por proventos · fonte: {fonteOficialLista}
              </span>
            </p>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!state.data) return null;
  const { intradiario, oficial_d1, consultado_em } = state.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold tabular-nums">
          {formatBRL(intradiario.preco)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({intradiario.moeda})
          </span>
        </p>
        {intradiario.variacao_pct !== null ? (
          <span
            className={cn(
              "text-sm tabular-nums",
              intradiario.variacao_pct >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatPercent(intradiario.variacao_pct)}
          </span>
        ) : (
          <UnavailableValue label="variação indisponível" className="text-xs" />
        )}
        <Badge
          variant="warning"
          title="Cotação de agregador — não é fonte primária oficial e não pode ser usada em cálculos"
        >
          AGREGADOR — indicativo
        </Badge>
        {!intradiario.usavel_em_calculos && (
          <Badge variant="muted">Não usável em cálculos</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Fonte: {intradiario.fonte} ·{" "}
        {intradiario.data_hora ? (
          <>horário da cotação: {formatDateTimeBR(intradiario.data_hora)}</>
        ) : (
          <>
            horário da cotação: <UnavailableValue />
          </>
        )}{" "}
        · fechamento anterior:{" "}
        {intradiario.fechamento_anterior !== null ? (
          <span className="tabular-nums">
            {formatBRL(intradiario.fechamento_anterior)}
          </span>
        ) : (
          <UnavailableValue />
        )}
      </p>

      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
          aria-hidden
        />
        <p>{intradiario.aviso}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Fechamento oficial D-1 (comparação)
        </p>
        <p className="mt-1 tabular-nums">
          {oficial_d1.fechamento !== null ? (
            <span className="font-semibold">
              {formatBRL(oficial_d1.fechamento)}
            </span>
          ) : (
            <UnavailableValue />
          )}{" "}
          <span className="text-xs text-muted-foreground">
            no pregão de {formatDateBR(oficial_d1.pregao)} · fonte:{" "}
            {oficial_d1.fonte}
          </span>
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Consultado em {formatDateTimeBR(consultado_em)}
        {!intradiario.token_configurado &&
          " · token do agregador não configurado no backend"}
      </p>
    </div>
  );
}

export default function AtivosPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<AtivosPage | null>(null);

  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string>("");
  const [pagina, setPagina] = useState(1);

  /** Contagens do universo completo (primeira resposta sem filtros). */
  const [tiposUniverso, setTiposUniverso] = useState<Record<
    string,
    number
  > | null>(null);
  const [totalUniverso, setTotalUniverso] = useState<number | null>(null);

  const [intradiario, setIntradiario] = useState<
    Record<string, IntradiarioState>
  >({});
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null);

  const requestSeq = useRef(0);

  // Debounce da busca (400 ms) — sempre volta à página 1.
  useEffect(() => {
    const handle = setTimeout(() => {
      setBusca(buscaInput.trim());
      setPagina(1);
    }, 400);
    return () => clearTimeout(handle);
  }, [buscaInput]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setError(null);
    setRefreshing(true);
    try {
      const page = await fetchAtivos({
        tipo: tipo || undefined,
        busca: busca || undefined,
        limite: LIMITE_POR_PAGINA,
        pagina,
      });
      if (seq !== requestSeq.current) return;
      setData(page);
      if (!tipo && !busca) {
        setTiposUniverso(page.tipos);
        setTotalUniverso(page.total);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tipo, busca, pagina]);

  useEffect(() => {
    void load();
  }, [load]);

  const consultarIntradiario = useCallback((ticker: string) => {
    setLinhaAberta(ticker);
    setIntradiario((prev) => ({
      ...prev,
      [ticker]: { loading: true, data: null, error: null },
    }));
    fetchAtivoIntradiario(ticker)
      .then((result) => {
        setIntradiario((prev) => ({
          ...prev,
          [ticker]: { loading: false, data: result, error: null },
        }));
      })
      .catch((err) => {
        setIntradiario((prev) => ({
          ...prev,
          [ticker]: { loading: false, data: null, error: err },
        }));
      });
  }, []);

  const totalPaginas = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.limite));
  }, [data]);

  const chips = useMemo(() => {
    const counts = tiposUniverso ?? data?.tipos ?? {};
    const conhecidos = Object.keys(TIPO_LABELS);
    const extras = Object.keys(counts).filter(
      (key) => !conhecidos.includes(key)
    );
    return [...conhecidos, ...extras].map((key) => ({
      key,
      label: tipoLabel(key),
      count: typeof counts[key] === "number" ? counts[key] : null,
    }));
  }, [tiposUniverso, data]);

  const header = (
    <ApiPageHeader
      icon={Database}
      title="Banco de Ativos B3"
      description={PAGE_DESCRIPTION}
    />
  );

  if (loading) return <PageSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        {header}
        <ApiErrorState error={error} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Ativos no universo"
          value={
            totalUniverso !== null
              ? totalUniverso.toLocaleString("pt-BR")
              : data.total.toLocaleString("pt-BR")
          }
          helper="Registro completo do backend (gold)"
          icon={Database}
        />
        <StatCard
          label="Data-base do registro"
          value={formatDateBR(data.data_base)}
          helper="Último pregão consolidado na B3"
          icon={CalendarDays}
        />
        <StatCard
          label="Resultado atual"
          value={data.total.toLocaleString("pt-BR")}
          helper={
            busca || tipo
              ? "Ativos que atendem aos filtros aplicados"
              : "Sem filtros aplicados"
          }
          icon={Building2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Busca e filtros</CardTitle>
          <CardDescription>
            A classificação de tipo é <strong>heurística</strong> (derivada do
            código e da especificação do ticker no cadastro da B3) — por isso
            cada linha carrega um selo de confiança ALTA/MEDIA/BAIXA. Não é um
            dado oficial de classe de ativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full max-w-md space-y-1.5">
            <Label htmlFor="busca-ticker">Buscar por ticker</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="busca-ticker"
                type="search"
                placeholder="Ex.: PETR4, HGLG11, AAPL34…"
                className="pl-9"
                value={buscaInput}
                onChange={(event) => setBuscaInput(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar por tipo de ativo"
          >
            <TipoChip
              label="Todos"
              count={totalUniverso}
              active={tipo === ""}
              onClick={() => {
                setTipo("");
                setPagina(1);
              }}
            />
            {chips.map((chip) => (
              <TipoChip
                key={chip.key}
                label={chip.label}
                count={chip.count}
                active={tipo === chip.key}
                onClick={() => {
                  setTipo(chip.key);
                  setPagina(1);
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ativos — página {data.pagina} de {totalPaginas}
          </CardTitle>
          <CardDescription>
            Fechamentos oficiais da B3, NÃO ajustados por proventos — proibido
            interpretar como retorno total. O botão &ldquo;cotação agora&rdquo;
            consulta um agregador (indicativo, nunca usado em cálculos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.ativos.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nenhum ativo encontrado"
              description={
                busca || tipo
                  ? "Nenhum ativo do registro atende aos filtros atuais. Ajuste a busca ou o tipo selecionado."
                  : "O registro de ativos retornou vazio para esta página."
              }
            />
          ) : (
            <div
              className={cn(refreshing && "opacity-60 transition-opacity")}
              aria-busy={refreshing}
            >
              {refreshing && (
                <p className="sr-only" aria-live="polite">
                  Atualizando lista de ativos…
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Ticker</TableHead>
                    <TableHead scope="col">
                      Tipo (heurístico) · confiança
                    </TableHead>
                    <TableHead scope="col">Especificação</TableHead>
                    <TableHead scope="col">Último pregão</TableHead>
                    <TableHead scope="col" className="text-right">
                      Fechamento (não ajustado por proventos)
                    </TableHead>
                    <TableHead scope="col">CNPJ emissor</TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ativos.map((ativo) => {
                    const estado = intradiario[ativo.ticker];
                    const aberto = linhaAberta === ativo.ticker;
                    return (
                      <React.Fragment key={ativo.ticker}>
                        <TableRow>
                          <TableCell className="font-mono font-medium">
                            {ativo.ticker}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline">
                                {tipoLabel(ativo.tipo)}
                              </Badge>
                              <ConfidenceBadge
                                value={ativo.classificacao_confianca}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[14rem] text-xs text-muted-foreground">
                            {ativo.especificacao || <UnavailableValue />}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateBR(ativo.ultimo_pregao)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {ativo.ultimo_fechamento !== null ? (
                              formatBRL(ativo.ultimo_fechamento)
                            ) : (
                              <UnavailableValue />
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {ativo.cnpj_emissor ?? <UnavailableValue />}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Consultar cotação agora de ${ativo.ticker} (agregador, indicativa)`}
                              aria-expanded={aberto}
                              disabled={estado?.loading === true}
                              onClick={() => {
                                if (aberto && !estado?.loading) {
                                  setLinhaAberta(null);
                                  return;
                                }
                                consultarIntradiario(ativo.ticker);
                              }}
                            >
                              <Zap className="h-3.5 w-3.5" aria-hidden />
                              {aberto ? "Fechar" : "Cotação agora"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {aberto && estado && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={7}
                              className="bg-slate-50 p-4"
                            >
                              <div aria-live="polite">
                                <IntradiarioResult
                                  ativo={ativo}
                                  state={estado}
                                  fonteOficialLista={data.fonte}
                                  onRetry={() =>
                                    consultarIntradiario(ativo.ticker)
                                  }
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data.total.toLocaleString("pt-BR")} ativo(s) · página{" "}
              {data.pagina} de {totalPaginas} · {data.limite} por página
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.pagina <= 1 || refreshing}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.pagina >= totalPaginas || refreshing}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                Próxima
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div
        role="note"
        className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          Metodologia: o universo vem do registro gold do backend (cadastro +
          COTAHIST da B3). A classificação de tipo é heurística — o selo de
          confiança indica o quão inequívoco é o padrão do ticker/especificação;
          use o CNPJ do emissor (quando disponível) como chave, nunca o ticker.
          Fechamentos não são ajustados por proventos. A cotação
          &ldquo;agora&rdquo; vem de agregador (brapi.dev), é apenas indicativa
          e nunca alimenta cálculos do sistema. Nada nesta tela é recomendação
          de investimento.
        </p>
      </div>

      <MetaFooter
        fontes={[data.fonte]}
        entries={[
          { label: "Data-base", value: formatDateBR(data.data_base) },
          {
            label: "Universo",
            value: `${(totalUniverso ?? data.total).toLocaleString("pt-BR")} ativos`,
          },
        ]}
      />
    </div>
  );
}
