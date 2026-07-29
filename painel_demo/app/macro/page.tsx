"use client";

/**
 * Macro (Fase 6): regimes classificados deterministicamente pelo backend e
 * séries oficiais do BCB (GET /v1/macro/regimes). O frontend apenas exibe;
 * dimensões INDISPONIVEL viram estado vazio explicativo, nunca 0.
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, Info, LineChart, ListChecks, ShieldOff } from "lucide-react";
import {
  fetchMacroRegimes,
  type MacroRegime,
  type MacroRegimes,
  type SeriePonto,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  ConfidenceBadge,
  MetaFooter,
  PageSkeleton,
  UnavailableValue,
  formatDateBR,
  humanizeKey,
} from "@/components/investment-os/shared";
import { SeriesLineChart } from "@/components/investment-os/line-charts";
import { CHART_COLORS } from "@/components/charts/chart-tooltip";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PAGE_DESCRIPTION =
  "Regimes macroeconômicos classificados por regras determinísticas do backend sobre séries oficiais do BCB, com premissas e limites de escopo sempre visíveis.";

const EXPECTATIVA_MARKER = "EXPECTATIVA DE MERCADO";

/**
 * Séries exibidas com unidade documentada (SGS/BCB). A unidade é metadado de
 * exibição da série oficial, não um cálculo do frontend.
 */
const SERIES_EXIBIDAS = [
  { id: "selic_meta", titulo: "Meta Selic", unidade: "% a.a.", digits: 2 },
  {
    id: "ipca_mensal",
    titulo: "IPCA — variação mensal",
    unidade: "% a.m.",
    digits: 2,
  },
  {
    id: "ptax_venda",
    titulo: "Câmbio PTAX (venda)",
    unidade: "R$/US$",
    digits: 4,
  },
  {
    id: "divida_bruta_pib",
    titulo: "Dívida bruta do governo geral",
    unidade: "% do PIB",
    digits: 2,
  },
] as const;

function isRegimeIndisponivel(regime: MacroRegime): boolean {
  return (
    regime.confianca === "INDISPONIVEL" ||
    regime.estado.trim().toLowerCase() === "indisponivel"
  );
}

function RegimeCard({ regime }: { regime: MacroRegime }) {
  const expectativa = regime.natureza.toUpperCase().includes(EXPECTATIVA_MARKER);
  const indisponivel = isRegimeIndisponivel(regime);

  return (
    <Card className={expectativa ? "border-amber-300" : undefined}>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {humanizeKey(regime.dimensao)}
          </p>
          <ConfidenceBadge value={regime.confianca} />
        </div>

        {indisponivel ? (
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <p>
              <UnavailableValue label="Estado indisponível" />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O backend não pôde classificar esta dimensão — sem dado
              suficiente, nada é pontuado (nunca exibido como 0 ou neutro).
            </p>
          </div>
        ) : (
          <p className="text-lg font-semibold">{humanizeKey(regime.estado)}</p>
        )}

        <p className="text-sm text-muted-foreground">{regime.detalhe}</p>

        <div
          className={
            expectativa
              ? "rounded-xl border border-amber-300 bg-amber-50 p-3"
              : "rounded-xl border border-border bg-surface-raised p-3"
          }
        >
          {expectativa && (
            <Badge variant="warning" className="mb-1.5">
              Expectativa de mercado — não é fato
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">{regime.natureza}</p>
        </div>

        <p className="text-xs text-muted-foreground/70">
          Data-base:{" "}
          {regime.data_base ? (
            formatDateBR(regime.data_base)
          ) : (
            <UnavailableValue />
          )}{" "}
          · Fonte: <span className="font-mono">{regime.fonte}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function SerieBlock({
  titulo,
  unidade,
  digits,
  color,
  pontos,
}: {
  titulo: string;
  unidade: string;
  digits: number;
  color: string;
  pontos: SeriePonto[] | undefined;
}) {
  const ultimo = pontos && pontos.length > 0 ? pontos[pontos.length - 1] : null;
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {titulo}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({unidade})
          </span>
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {ultimo ? (
            <>
              último: <span className="font-medium text-foreground">
                {formatNumber(ultimo.valor, digits)}
              </span>{" "}
              em {formatDateBR(ultimo.data)}
            </>
          ) : (
            <UnavailableValue label="sem pontos" />
          )}
        </p>
      </div>
      <div className="mt-3">
        {pontos && pontos.length > 0 ? (
          <SeriesLineChart
            points={pontos}
            unit={unidade}
            color={color}
            digits={digits}
          />
        ) : (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Série não disponível na resposta da API.
          </p>
        )}
      </div>
    </div>
  );
}

export default function MacroPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<MacroRegimes | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMacroRegimes());
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
    <ApiPageHeader
      icon={Activity}
      title="Macro — regimes e séries"
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

      <section aria-label="Regimes por dimensão" className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.regimes.map((regime) => (
            <RegimeCard key={regime.dimensao} regime={regime} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" aria-hidden />
              Premissas da classificação
            </CardTitle>
            <CardDescription>
              Regras determinísticas do backend — sempre visíveis junto dos
              regimes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {data.premissas.map((premissa) => (
                <li key={premissa}>{premissa}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldOff className="h-4 w-4 text-amber-600" aria-hidden />
              Fora do escopo desta fase
            </CardTitle>
            <CardDescription>
              O que o sistema NÃO cobre hoje — sem fonte oficial, nada é
              pontuado (rumor não pontua).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.fora_do_escopo_desta_fase.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma limitação de escopo declarada pela API.
              </p>
            ) : (
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {data.fora_do_escopo_desta_fase.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="h-4 w-4 text-primary" aria-hidden />
            Séries oficiais recentes (BCB/SGS)
          </CardTitle>
          <CardDescription>
            Pontos exatamente como fornecidos pela API, com data e unidade da
            série oficial. Nenhum valor é interpolado ou calculado no frontend.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {SERIES_EXIBIDAS.map((serie, index) => (
            <SerieBlock
              key={serie.id}
              titulo={serie.titulo}
              unidade={serie.unidade}
              digits={serie.digits}
              color={CHART_COLORS[index % CHART_COLORS.length]}
              pontos={data.series_recentes[serie.id]}
            />
          ))}
        </CardContent>
      </Card>

      <div
        className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground"
        role="note"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          Metodologia: os regimes são classificados por regras determinísticas,
          documentadas e testadas no backend
          (<span className="font-mono">investment_os/engine/regimes.py</span>).
          Macro nunca justifica comprar empresa ruim: o uso é restrito a
          cenário, sensibilidade, risco e ritmo de aportes. Não é recomendação
          de investimento.
        </p>
      </div>

      <MetaFooter
        fontes={Object.entries(data.fontes).map(
          ([key, value]) => `${key}: ${value}`
        )}
        entries={[
          { label: "Data de geração", value: formatDateBR(data.data_geracao) },
        ]}
      />
    </div>
  );
}
