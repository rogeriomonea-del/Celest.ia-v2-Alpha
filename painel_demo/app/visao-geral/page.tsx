"use client";

/**
 * Visão geral (Fase 6): painel agregado servido por GET /v1/overview.
 * Cada bloco pode vir como `indisponivel` — nesse caso a tela mostra o motivo
 * e o comando que gera o artefato, nunca números inventados.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Briefcase,
  Filter,
  Gauge,
  HeartPulse,
  Landmark,
  ScrollText,
} from "lucide-react";
import { formatNumber, formatPercentPlain } from "@/lib/utils";
import {
  fetchOverview,
  isIndisponivel,
  toFiniteNumber,
  type IndisponivelBlock,
  type Overview,
  type OverviewScreener,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  PageHero,
  ConfidenceBadge,
  MetaFooter,
  PageSkeleton,
  UnavailableValue,
  formatDateBR,
  formatDateTimeBR,
  humanizeKey,
} from "@/components/investment-os/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PAGE_DESCRIPTION =
  "Painel inicial com o estado atual do screener, Tesouro Direto, regimes macro, carteira e saúde dos dados — tudo servido pela API do backend.";

/** Comando do backend que gera o artefato gold de cada bloco. */
const GOLD_COMMANDS = {
  screener: "python -m investment_os.cli build",
  tesouro: "python -m investment_os.cli macro",
  macro: "python -m investment_os.cli macro",
} as const;

function UnavailableBlock({
  block,
  command,
}: {
  block: IndisponivelBlock;
  command?: string;
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-medium">Bloco indisponível</p>
      <p className="mt-1 text-muted-foreground">
        {block.motivo ?? "Motivo não informado pela API."}
      </p>
      {command && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Para gerar, rode no repositório{" "}
            <span className="font-mono">Celest.ia-v2-Alpha</span>:
          </p>
          <code className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-xs">
            {command}
          </code>
        </>
      )}
    </div>
  );
}

function DetailLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </Button>
  );
}

function countBadgeVariant(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "APROVADA") return "default" as const;
  if (normalized === "QUASE_APROVADA") return "warning" as const;
  if (normalized === "REPROVADA") return "destructive" as const;
  return "muted" as const;
}

function AprovadaChip({
  aprovada,
}: {
  aprovada: OverviewScreener["aprovadas"][number];
}) {
  const pl = toFiniteNumber(aprovada.pl);
  const pvpa = toFiniteNumber(aprovada.pvpa);
  return (
    <li className="rounded-xl border border-border bg-surface-raised px-3 py-2">
      <p className="font-mono text-sm font-semibold">{aprovada.ticker}</p>
      <p className="truncate text-xs text-muted-foreground" title={aprovada.empresa}>
        {aprovada.empresa}
      </p>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
        P/L:{" "}
        {pl !== null ? formatNumber(pl) : <UnavailableValue />}
        {" · "}P/VPA:{" "}
        {pvpa !== null ? formatNumber(pvpa) : <UnavailableValue />}
      </p>
    </li>
  );
}

const STALE_LIMIT_HOURS = 24;

function hoursSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return null;
  return (nowMs - parsed) / (1000 * 60 * 60);
}

function FreshnessRow({
  label,
  iso,
  nowMs,
}: {
  label: string;
  iso: string | null;
  nowMs: number;
}) {
  const hours = hoursSince(iso, nowMs);
  const stale = hours !== null && hours > STALE_LIMIT_HOURS;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {iso ? (
          <span className="tabular-nums">{formatDateTimeBR(iso)}</span>
        ) : (
          <UnavailableValue label="nunca gerado" />
        )}
        {stale && hours !== null && (
          <Badge variant="warning">
            desatualizado há{" "}
            {hours >= 48 ? `${Math.floor(hours / 24)} dias` : `${Math.floor(hours)}h`}
          </Badge>
        )}
      </span>
    </div>
  );
}

export default function VisaoGeralPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadedAtMs, setLoadedAtMs] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchOverview());
      setLoadedAtMs(Date.now());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <PageHero icon={Gauge} title="Visão geral" description={PAGE_DESCRIPTION} />
  );

  const screener = overview?.screener ?? null;
  const contagensOrdenadas = useMemo(() => {
    if (!screener || isIndisponivel(screener)) return [];
    return Object.entries(screener.contagens).sort((a, b) => b[1] - a[1]);
  }, [screener]);

  if (loading) return <PageSkeleton />;

  if (error || !overview) {
    return (
      <div className="space-y-6">
        {header}
        <ApiErrorState error={error} onRetry={() => void load()} />
      </div>
    );
  }

  const { tesouro, macro, carteira, saude_dados: saude } = overview;

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-primary" aria-hidden />
              Screener de ações
            </CardTitle>
            <CardDescription>
              {isIndisponivel(screener)
                ? "Triagem fundamentalista sobre dados oficiais CVM/B3."
                : `Preset ${screener?.preset} · data-base ${formatDateBR(
                    screener?.run_date
                  )} · universo de ${screener?.universo} empresas.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIndisponivel(screener) ? (
              <UnavailableBlock block={screener} command={GOLD_COMMANDS.screener} />
            ) : screener ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {contagensOrdenadas.map(([status, count]) => (
                    <Badge key={status} variant={countBadgeVariant(status)}>
                      {humanizeKey(status.toLowerCase())}: {count}
                    </Badge>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Aprovadas
                  </p>
                  {screener.aprovadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma empresa aprovada nesta rodada do preset.
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {screener.aprovadas.map((aprovada) => (
                        <AprovadaChip key={aprovada.ticker} aprovada={aprovada} />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" aria-hidden />
              Tesouro Direto
            </CardTitle>
            <CardDescription>
              {isIndisponivel(tesouro)
                ? "Painel de taxas, radar de janelas e cenários MTM."
                : `Data-base ${formatDateBR(tesouro.data_base)} · ${
                    tesouro.n_titulos
                  } títulos · ${tesouro.janelas_no_radar} janelas no radar.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIndisponivel(tesouro) ? (
              <UnavailableBlock block={tesouro} command={GOLD_COMMANDS.tesouro} />
            ) : (
              <>
                {tesouro.referencia_ipca2050 ? (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Referência monitorada · Tesouro IPCA+ 2050
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatPercentPlain(
                        tesouro.referencia_ipca2050.taxa_pct,
                        2
                      )}{" "}
                      a.a. (real)
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        vs. threshold monitorado de{" "}
                        {formatPercentPlain(
                          tesouro.referencia_ipca2050.threshold_monitorado_pct,
                          2
                        )}{" "}
                        <span className="text-xs">
                          (premissa configurável do usuário — não é meta oficial)
                        </span>
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Percentil histórico da taxa atual:{" "}
                      {tesouro.referencia_ipca2050.percentil_historico !== null ? (
                        formatNumber(
                          tesouro.referencia_ipca2050.percentil_historico,
                          1
                        )
                      ) : (
                        <UnavailableValue />
                      )}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground/70">
                      Taxa alta em relação ao histórico NÃO é recomendação de
                      investimento.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Referência IPCA+ 2050:{" "}
                    <UnavailableValue label="indisponível na data-base atual" />
                  </p>
                )}
                <DetailLink href="/tesouro" label="Abrir painel do Tesouro" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              Regimes macro
            </CardTitle>
            <CardDescription>
              {isIndisponivel(macro)
                ? "Classificação determinística de regimes sobre séries do BCB."
                : `Gerado em ${formatDateBR(macro.data_geracao)} · ${
                    macro.regimes.length
                  } dimensões classificadas.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIndisponivel(macro) ? (
              <UnavailableBlock block={macro} command={GOLD_COMMANDS.macro} />
            ) : (
              <>
                <ul className="space-y-2">
                  {macro.regimes.map((regime) => (
                    <li
                      key={regime.dimensao}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="text-muted-foreground">
                          {humanizeKey(regime.dimensao)}:
                        </span>{" "}
                        <span className="font-medium">
                          {humanizeKey(regime.estado)}
                        </span>
                        {regime.eh_expectativa && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                            expectativa de mercado — não é fato
                          </span>
                        )}
                        <span className="hidden">
                        </span>
                      </span>
                      <ConfidenceBadge value={regime.confianca} />
                    </li>
                  ))}
                </ul>
                <DetailLink href="/macro" label="Abrir regimes e séries" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-primary" aria-hidden />
              Carteira
            </CardTitle>
            <CardDescription>
              Snapshots importados e situação da política de investimentos
              (IPS). O overview não expõe valores da carteira.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIndisponivel(carteira) ? (
              <UnavailableBlock
                block={{
                  status: "indisponivel",
                  motivo:
                    carteira.motivo ??
                    "Banco de dados local da carteira indisponível para a API.",
                }}
              />
            ) : (
              <>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Snapshots</dt>
                    <dd className="font-medium tabular-nums">
                      {carteira.snapshots}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Último snapshot</dt>
                    <dd className="tabular-nums">
                      {carteira.ultimo_snapshot_em ? (
                        formatDateTimeBR(carteira.ultimo_snapshot_em)
                      ) : (
                        <UnavailableValue label="nenhum importado" />
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">IPS confirmada</dt>
                    <dd>
                      <Badge
                        variant={carteira.ips_confirmada ? "default" : "warning"}
                      >
                        {carteira.ips_confirmada ? "Sim" : "Não"}
                      </Badge>
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <DetailLink href="/carteira" label="Abrir carteira" />
                  <Button asChild variant="outline" size="sm">
                    <Link href="/politica">
                      <ScrollText className="h-4 w-4" aria-hidden />
                      Perfil e política (IPS)
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4 text-primary" aria-hidden />
            Saúde dos dados
          </CardTitle>
          <CardDescription>
            Última atualização de cada artefato gold e da auditoria de
            ingestão. Artefatos com mais de {STALE_LIMIT_HOURS}h recebem
            destaque de desatualização. {saude.nota}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <FreshnessRow
            label="Gold · screener"
            iso={saude.ultima_atualizacao_gold.screener}
            nowMs={loadedAtMs}
          />
          <FreshnessRow
            label="Gold · Tesouro"
            iso={saude.ultima_atualizacao_gold.tesouro}
            nowMs={loadedAtMs}
          />
          <FreshnessRow
            label="Gold · macro"
            iso={saude.ultima_atualizacao_gold.macro}
            nowMs={loadedAtMs}
          />
          <FreshnessRow
            label="Auditoria de ingestão"
            iso={saude.auditoria_ingestao}
            nowMs={loadedAtMs}
          />
        </CardContent>
      </Card>

      <MetaFooter
        fontes={[
          "API do backend Investment Intelligence OS (artefatos gold: CVM, B3, Tesouro Transparente, BCB)",
        ]}
        entries={[
          {
            label: "Overview gerado em",
            value: formatDateTimeBR(overview.gerado_em),
          },
        ]}
      />
    </div>
  );
}
