"use client";

/**
 * Tesouro Direto (Fase 6): curvas, tabela completa de títulos, radar de
 * janelas e cenários de marcação a mercado — tudo de GET /v1/tesouro/*.
 * Títulos não modelados exibem badge com motivo, NUNCA um número no lugar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Landmark,
  ListOrdered,
  Radar,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { formatBRL, formatNumber, formatPercent, formatPercentPlain } from "@/lib/utils";
import {
  fetchTesouroCenarios,
  fetchTesouroTitulos,
  type TesouroCenarios,
  type TesouroPainel,
  type TesouroTitulo,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  ConfidenceBadge,
  MetaFooter,
  NativeSelect,
  PageSkeleton,
  UnavailableValue,
  formatDateBR,
} from "@/components/investment-os/shared";
import { YieldCurveChart } from "@/components/investment-os/line-charts";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  "Taxas ofertadas ao varejo pelo Tesouro Direto, curvas real e nominal, radar de janelas por percentil histórico e cenários de marcação a mercado calculados pelo backend.";

const AVISO_NAO_RECOMENDACAO =
  "Taxa historicamente alta NÃO é recomendação de investimento — avalie objetivo, prazo e risco de marcação a mercado.";

function tituloKey(tipo: string, vencimento: string): string {
  return `${tipo}|${vencimento}`;
}

function NaoModeladoBadge({ motivo }: { motivo?: string }) {
  return (
    <div className="space-y-1">
      <Badge variant="muted" title={motivo ?? "Motivo não informado pela API."}>
        Não modelado
      </Badge>
      {motivo && (
        <p className="max-w-[16rem] text-[11px] leading-snug text-muted-foreground/70">
          {motivo}
        </p>
      )}
    </div>
  );
}

function RiskCell({ titulo, value, format }: {
  titulo: TesouroTitulo;
  value: number | undefined;
  format: (value: number) => string;
}) {
  if (!titulo.modelado || value === undefined) {
    return (
      <UnavailableValue
        label="não modelado"
        className="text-xs"
      />
    );
  }
  return <>{format(value)}</>;
}

export default function TesouroPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [painel, setPainel] = useState<TesouroPainel | null>(null);

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [cenarios, setCenarios] = useState<TesouroCenarios | null>(null);
  const [cenariosLoading, setCenariosLoading] = useState(false);
  const [cenariosError, setCenariosError] = useState<unknown>(null);
  const [cenariosNonce, setCenariosNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPainel(await fetchTesouroTitulos());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const titulosOrdenados = useMemo(() => {
    if (!painel) return [];
    return [...painel.titulos].sort(
      (a, b) =>
        a.tipo.localeCompare(b.tipo) || a.vencimento.localeCompare(b.vencimento)
    );
  }, [painel]);

  const modelados = useMemo(
    () => titulosOrdenados.filter((titulo) => titulo.modelado),
    [titulosOrdenados]
  );

  const notasRadar = useMemo(() => {
    if (!painel) return [];
    return Array.from(new Set(painel.radar_janelas.map((j) => j.nota)));
  }, [painel]);

  useEffect(() => {
    if (!selectedKey) {
      setCenarios(null);
      setCenariosError(null);
      return;
    }
    const [tipo, vencimento] = selectedKey.split("|");
    let cancelled = false;
    setCenariosLoading(true);
    setCenariosError(null);
    fetchTesouroCenarios(tipo, vencimento)
      .then((data) => {
        if (!cancelled) setCenarios(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setCenarios(null);
          setCenariosError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setCenariosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey, cenariosNonce]);

  const header = (
    <ApiPageHeader
      icon={Landmark}
      title="Tesouro Direto"
      description={PAGE_DESCRIPTION}
    />
  );

  if (loading) return <PageSkeleton />;

  if (error || !painel) {
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Data-base"
          value={formatDateBR(painel.data_base)}
          helper="Último pregão no CSV oficial do Tesouro Transparente"
          icon={CalendarDays}
        />
        <StatCard
          label="Títulos na data-base"
          value={String(painel.titulos.length)}
          helper={`${modelados.length} com risco modelado (duration/DV01)`}
          icon={ListOrdered}
        />
        <StatCard
          label="Janelas no radar"
          value={String(painel.radar_janelas.length)}
          helper={`Critério: taxa ≥ percentil ${formatNumber(
            painel.parametros_radar.percentil_entrada,
            0
          )} da própria série`}
          icon={Radar}
        />
        <StatCard
          label="Histórico oficial desde"
          value={formatDateBR(painel.historico_oficial_desde)}
          helper="Base usada nos percentis históricos"
          icon={Table2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Curvas de taxas ofertadas</CardTitle>
          <CardDescription>
            Pontos por vencimento na data-base {formatDateBR(painel.data_base)},
            separados por tipo de título. {painel.curvas.nota}. Curva real: %
            a.a. acima do IPCA; curva nominal: % a.a. prefixados.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">
              Curva real — Tesouro IPCA+{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (% a.a. reais)
              </span>
            </p>
            <YieldCurveChart points={painel.curvas.real_ipca} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              Curva nominal — Tesouro Prefixado{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (% a.a. nominais)
              </span>
            </p>
            <YieldCurveChart points={painel.curvas.nominal_prefixado} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-primary" aria-hidden />
            Radar de janelas — taxas em percentil alto
          </CardTitle>
          <CardDescription>
            Entrada: taxa atual ≥ percentil{" "}
            {formatNumber(painel.parametros_radar.percentil_entrada, 0)} da
            própria série (mínimo de{" "}
            {painel.parametros_radar.min_pregoes} pregões); saída por histerese
            no percentil{" "}
            {formatNumber(painel.parametros_radar.percentil_saida_hysteresis, 0)}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="note"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {notasRadar.length > 0 ? (
              notasRadar.map((nota) => <p key={nota}>{nota}</p>)
            ) : (
              <p>{AVISO_NAO_RECOMENDACAO}</p>
            )}
          </div>

          {painel.radar_janelas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma janela aberta pelos critérios atuais do radar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Título</TableHead>
                  <TableHead scope="col">Vencimento</TableHead>
                  <TableHead scope="col" className="text-right">
                    Taxa atual
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Percentil
                  </TableHead>
                  <TableHead scope="col">Critério</TableHead>
                  <TableHead scope="col">Invalidação</TableHead>
                  <TableHead scope="col">Confiança</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {painel.radar_janelas.map((janela) => (
                  <TableRow key={tituloKey(janela.tipo, janela.vencimento)}>
                    <TableCell className="font-medium">{janela.tipo}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateBR(janela.vencimento)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentPlain(janela.taxa_atual_pct, 2)} a.a.
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(janela.percentil, 1)}
                    </TableCell>
                    <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                      {janela.criterio}
                    </TableCell>
                    <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                      {janela.invalidacao} (saída:{" "}
                      {formatPercentPlain(janela.saida_hysteresis_pct, 2)})
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge value={janela.confianca} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
            Cenários de marcação a mercado (MTM)
          </CardTitle>
          <CardDescription>
            Selecione um título modelado para ver o efeito de choques paralelos
            de taxa sobre o PU, decomposto pelo backend em efeito duration,
            efeito convexidade e resíduo. Apenas títulos com risco modelado
            possuem cenários.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full max-w-md space-y-1.5">
            <Label htmlFor="cenario-titulo">Título modelado</Label>
            <NativeSelect
              id="cenario-titulo"
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              <option value="">Selecione um título…</option>
              {modelados.map((titulo) => (
                <option
                  key={tituloKey(titulo.tipo, titulo.vencimento)}
                  value={tituloKey(titulo.tipo, titulo.vencimento)}
                >
                  {titulo.tipo} · {formatDateBR(titulo.vencimento)} ·{" "}
                  {formatPercentPlain(titulo.taxa_compra_pct, 2)} a.a.
                </option>
              ))}
            </NativeSelect>
          </div>

          {!selectedKey && (
            <p className="text-sm text-muted-foreground">
              Nenhum título selecionado. Os cenários usam a taxa e o PU de
              compra da data-base {formatDateBR(painel.data_base)}.
            </p>
          )}

          {cenariosLoading && (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <div className="grid gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
              <Skeleton className="h-56" />
              <span className="sr-only">Carregando cenários do título…</span>
            </div>
          )}

          {cenariosError !== null && !cenariosLoading ? (
            <ApiErrorState
              error={cenariosError}
              onRetry={() => setCenariosNonce((nonce) => nonce + 1)}
            />
          ) : null}

          {cenarios && !cenariosLoading && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-surface-raised p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Duration Macaulay
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatNumber(cenarios.risco.duration_macaulay_anos)} anos
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Duration modificada
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatNumber(cenarios.risco.modified_duration_anos)} anos
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    DV01
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatBRL(cenarios.risco.dv01_brl, {
                      maximumFractionDigits: 4,
                    })}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Convexidade
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatNumber(cenarios.risco.convexidade)}
                  </p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="text-right">
                      Choque
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Nova taxa
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      PU novo
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Variação
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Efeito duration
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Efeito convexidade
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Resíduo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cenarios.cenarios_mtm.map((cenario) => (
                    <TableRow key={cenario.choque_bps}>
                      <TableCell className="text-right font-medium tabular-nums">
                        {cenario.choque_bps > 0 ? "+" : ""}
                        {cenario.choque_bps} bps
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercentPlain(cenario.taxa_pct, 2)} a.a.
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(cenario.pu_novo)}
                      </TableCell>
                      <TableCell
                        className={
                          cenario.variacao_pct >= 0
                            ? "text-right tabular-nums text-profit"
                            : "text-right tabular-nums text-loss"
                        }
                      >
                        {formatPercent(cenario.variacao_pct)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(cenario.efeito_duration_brl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(cenario.efeito_convexidade_brl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatBRL(cenario.residuo_brl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <p className="text-xs text-muted-foreground/70">
                {cenarios.tipo} · vencimento{" "}
                {formatDateBR(cenarios.vencimento)} · taxa atual{" "}
                {formatPercentPlain(cenarios.taxa_atual_pct, 2)} a.a. ·
                data-base {formatDateBR(cenarios.data_base)} · fonte:{" "}
                {cenarios.fonte}. Cenários hipotéticos de sensibilidade — não
                são previsão nem recomendação.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4 text-primary" aria-hidden />
            Todos os títulos da data-base
          </CardTitle>
          <CardDescription>
            Taxas e PUs de compra/venda ofertados ao varejo. Métricas de risco
            só aparecem para títulos modelados; nos demais o status é exibido
            no lugar — nunca um número.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {titulosOrdenados.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhum título na data-base atual.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Título</TableHead>
                  <TableHead scope="col">Vencimento</TableHead>
                  <TableHead scope="col" className="text-right">
                    Taxa compra
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Taxa venda
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    PU compra
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    PU venda
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Duration mod.
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    DV01
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Percentil hist.
                  </TableHead>
                  <TableHead scope="col">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {titulosOrdenados.map((titulo) => (
                  <TableRow key={tituloKey(titulo.tipo, titulo.vencimento)}>
                    <TableCell className="font-medium">
                      {titulo.tipo}
                      {(titulo.termo === "real" ||
                        titulo.termo === "nominal") && (
                        <span className="block text-[11px] text-muted-foreground/70">
                          taxa {titulo.termo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateBR(titulo.vencimento)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentPlain(titulo.taxa_compra_pct, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {titulo.taxa_venda_pct !== null ? (
                        formatPercentPlain(titulo.taxa_venda_pct, 2)
                      ) : (
                        <UnavailableValue label="—" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {titulo.pu_compra !== null ? (
                        formatBRL(titulo.pu_compra)
                      ) : (
                        <UnavailableValue label="—" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {titulo.pu_venda !== null ? (
                        formatBRL(titulo.pu_venda)
                      ) : (
                        <UnavailableValue label="—" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <RiskCell
                        titulo={titulo}
                        value={titulo.modified_duration_anos}
                        format={(value) => `${formatNumber(value)} anos`}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <RiskCell
                        titulo={titulo}
                        value={titulo.dv01_brl}
                        format={(value) =>
                          formatBRL(value, { maximumFractionDigits: 4 })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {titulo.historico ? (
                        <>
                          {formatNumber(
                            titulo.historico.percentil_taxa_atual,
                            1
                          )}
                          <span className="block text-[11px] text-muted-foreground/70">
                            {titulo.historico.pregoes} pregões desde{" "}
                            {formatDateBR(titulo.historico.primeiro)}
                          </span>
                        </>
                      ) : (
                        <UnavailableValue label="sem histórico" />
                      )}
                    </TableCell>
                    <TableCell>
                      {titulo.modelado ? (
                        <Badge>Modelado</Badge>
                      ) : (
                        <NaoModeladoBadge motivo={titulo.motivo_nao_modelado} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div
        role="note"
        className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground"
      >
        Metodologia: as taxas exibidas são as ofertadas ao varejo pelo Tesouro
        Direto (CSV oficial do Tesouro Transparente) — NÃO representam a curva
        indicativa ANBIMA. Duration, DV01, convexidade e cenários MTM são
        calculados pelo motor determinístico do backend; o frontend apenas
        exibe. Nada nesta tela é recomendação de investimento.
      </div>

      <MetaFooter
        fontes={[painel.fonte]}
        entries={[
          { label: "Data-base", value: formatDateBR(painel.data_base) },
          {
            label: "Histórico oficial desde",
            value: formatDateBR(painel.historico_oficial_desde),
          },
        ]}
      />
    </div>
  );
}
