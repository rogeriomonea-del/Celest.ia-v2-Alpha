import {
  MARKET_DATA,
  findMarketAsset,
  type MarketAsset,
} from "@/lib/agents/market-data";
import type {
  AgentLogEntry,
  AuditorResult,
  AuditVerdict,
  ComiteResult,
  CommitteePick,
  ContextDossier,
  DREAnalysis,
  DREResult,
  LogLevel,
  PesquisaResult,
  PipelineScope,
  ScreenedCandidate,
  ScreeningCriteria,
  TriagemResult,
} from "@/lib/agents/types";
import { DEFAULT_CRITERIA } from "@/lib/agents/types";
import { clamp } from "@/lib/utils";

class AgentLogger {
  private entries: AgentLogEntry[] = [];

  log(level: LogLevel, message: string): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
  }

  info(message: string): void {
    this.log("info", message);
  }

  data(message: string): void {
    this.log("data", message);
  }

  success(message: string): void {
    this.log("success", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  flush(): AgentLogEntry[] {
    return this.entries;
  }
}

function resolveUniverse(
  scope: PipelineScope,
  portfolioTickers: string[]
): MarketAsset[] {
  if (scope === "carteira" && portfolioTickers.length > 0) {
    const assets = portfolioTickers
      .map((t) => findMarketAsset(t))
      .filter((a): a is MarketAsset => a !== undefined && a.assetClass === "Ações");
    if (assets.length >= 3) return assets;
  }
  return MARKET_DATA.filter((a) => a.assetClass === "Ações");
}

function screeningScore(asset: MarketAsset, criteria: ScreeningCriteria): number {
  const dyScore = clamp((asset.dividendYield / 12) * 10, 0, 10);
  const pvp = asset.priceToBook ?? 99;
  const pe = asset.priceEarnings ?? 99;
  const valuationScore = clamp(10 - (pvp - 0.6) * 2.2 - Math.max(pe - 6, 0) * 0.35, 0, 10);
  const roeScore = clamp(((asset.roe ?? 0) / 25) * 10, 0, 10);
  return Number((dyScore * 0.35 + valuationScore * 0.35 + roeScore * 0.3).toFixed(2));
}

export function runTriagemEngine(
  scope: PipelineScope,
  portfolioTickers: string[],
  criteria: ScreeningCriteria = DEFAULT_CRITERIA
): { logs: AgentLogEntry[]; result: TriagemResult } {
  const logger = new AgentLogger();
  const universe = resolveUniverse(scope, portfolioTickers);

  logger.info(`Inicializando varredura fundamentalista [escopo: ${scope}]`);
  logger.data(
    `Universo carregado: ${universe.length} ativos elegíveis (classe Ações)`
  );
  logger.data(
    `Critérios ativos: DY >= ${criteria.minDividendYield}% | P/L <= ${criteria.maxPriceEarnings} | P/VP <= ${criteria.maxPriceToBook} | ROE >= ${criteria.minRoe}%`
  );

  const candidates: ScreenedCandidate[] = [];
  let rejectedCount = 0;

  for (const asset of universe) {
    const failures: string[] = [];
    if (asset.dividendYield < criteria.minDividendYield) {
      failures.push(`DY ${asset.dividendYield.toFixed(1)}% abaixo do mínimo`);
    }
    if ((asset.priceEarnings ?? 999) > criteria.maxPriceEarnings) {
      failures.push(`P/L ${asset.priceEarnings?.toFixed(1)} acima do teto`);
    }
    if ((asset.priceToBook ?? 999) > criteria.maxPriceToBook) {
      failures.push(`P/VP ${asset.priceToBook?.toFixed(1)} acima do teto`);
    }
    if ((asset.roe ?? 0) < criteria.minRoe) {
      failures.push(`ROE ${asset.roe?.toFixed(1) ?? "n/d"}% insuficiente`);
    }

    if (failures.length > 0) {
      rejectedCount += 1;
      logger.warn(`✗ ${asset.ticker} reprovado: ${failures[0]}`);
      continue;
    }

    const highlights: string[] = [
      `DY ${asset.dividendYield.toFixed(1)}%`,
      `P/L ${asset.priceEarnings?.toFixed(1) ?? "n/d"}`,
      `P/VP ${asset.priceToBook?.toFixed(2) ?? "n/d"}`,
      `ROE ${asset.roe?.toFixed(1) ?? "n/d"}%`,
    ];
    if ((asset.priceToBook ?? 99) < 1.2) {
      highlights.push("deep value (P/VP < 1,2)");
    }

    const score = screeningScore(asset, criteria);
    candidates.push({
      ticker: asset.ticker,
      name: asset.name,
      sector: asset.sector,
      price: asset.price,
      dividendYield: asset.dividendYield,
      priceEarnings: asset.priceEarnings,
      priceToBook: asset.priceToBook,
      roe: asset.roe,
      score,
      highlights,
    });
    logger.success(
      `✓ ${asset.ticker} aprovado — nota ${score.toFixed(2)} [${highlights.slice(0, 4).join(" · ")}]`
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 10);

  logger.data(
    `Ranking consolidado: ${candidates.length} aprovados de ${universe.length} analisados (${rejectedCount} cortes)`
  );
  logger.success(
    `Top ${top.length} encaminhado ao pipeline: ${top.map((c) => c.ticker).join(", ")}`
  );

  return {
    logs: logger.flush(),
    result: {
      universeSize: universe.length,
      criteria,
      candidates: top,
      rejectedCount,
    },
  };
}

function sentimentOf(asset: MarketAsset): {
  score: number;
  label: ContextDossier["sentimentLabel"];
} {
  if (asset.news.length === 0) return { score: 0, label: "neutro" };
  const total = asset.news.reduce((acc, n) => {
    if (n.sentiment === "positivo") return acc + 1;
    if (n.sentiment === "negativo") return acc - 1;
    return acc;
  }, 0);
  const score = Number((total / asset.news.length).toFixed(2));
  const label = score > 0.15 ? "positivo" : score < -0.15 ? "negativo" : "neutro";
  return { score, label };
}

export function runPesquisaEngine(
  scope: PipelineScope,
  portfolioTickers: string[]
): { logs: AgentLogEntry[]; result: PesquisaResult } {
  const logger = new AgentLogger();
  const universe = resolveUniverse(scope, portfolioTickers);

  logger.info("Conectando às bases de notícias corporativas e fatos relevantes...");
  logger.data(
    `Fontes indexadas: Valor Econômico, InfoMoney, Reuters Brasil, Exame, Money Times`
  );

  const dossiers: ContextDossier[] = [];
  let sourcesConsulted = 0;

  for (const asset of universe) {
    const { score, label } = sentimentOf(asset);
    sourcesConsulted += Math.max(asset.news.length, 1);

    const keyFacts = asset.news.map(
      (n) => `[${n.source}, há ${n.daysAgo}d] ${n.headline}`
    );

    dossiers.push({
      ticker: asset.ticker,
      name: asset.name,
      governance: asset.governance,
      governanceNote: asset.governanceNote,
      sentimentScore: score,
      sentimentLabel: label,
      keyFacts,
      riskFlags: asset.riskFlags,
    });

    logger.info(
      `Dossiê ${asset.ticker}: ${asset.news.length} notícia(s) · governança ${asset.governance} · sentimento ${label} (${score >= 0 ? "+" : ""}${score.toFixed(2)})`
    );
    if (asset.riskFlags.length > 0) {
      logger.warn(
        `⚑ ${asset.ticker}: ${asset.riskFlags.length} bandeira(s) de risco mapeada(s)`
      );
    }
  }

  logger.success(
    `Pesquisa concluída: ${dossiers.length} dossiês compilados a partir de ${sourcesConsulted} fontes`
  );

  return {
    logs: logger.flush(),
    result: { dossiers, sourcesConsulted },
  };
}

const SEVERE_RISK_PATTERNS = [
  /interfer[eê]ncia/i,
  /inadimpl[eê]ncia/i,
  /depend[eê]ncia/i,
  /controle estatal/i,
  /pol[ií]tic/i,
];

function countSevereFlags(flags: string[]): number {
  return flags.filter((flag) =>
    SEVERE_RISK_PATTERNS.some((pattern) => pattern.test(flag))
  ).length;
}

function contextQuality(dossier: ContextDossier): number {
  const severe = countSevereFlags(dossier.riskFlags);
  return clamp(5 + dossier.sentimentScore * 3 - severe * 1.5, 0, 10);
}

export function runAuditorEngine(
  triagem: TriagemResult,
  pesquisa: PesquisaResult
): { logs: AgentLogEntry[]; result: AuditorResult } {
  const logger = new AgentLogger();
  const dossierMap = new Map(pesquisa.dossiers.map((d) => [d.ticker, d]));

  logger.info(
    `Cruzando ${triagem.candidates.length} aprovados da triagem com ${pesquisa.dossiers.length} dossiês de contexto...`
  );

  const verdicts: AuditVerdict[] = [];

  for (const candidate of triagem.candidates) {
    const dossier = dossierMap.get(candidate.ticker);
    const reasons: string[] = [];
    let approved = true;

    if (!dossier) {
      approved = false;
      reasons.push("Sem dossiê de contexto — dado inconsistente entre agentes");
      verdicts.push({
        ticker: candidate.ticker,
        approved,
        compositeScore: 0,
        reasons,
      });
      logger.warn(`✗ ${candidate.ticker} CORTADO: inconsistência de dados`);
      continue;
    }

    const severeFlags = countSevereFlags(dossier.riskFlags);
    const quality = contextQuality(dossier);
    const compositeScore = Number(
      (candidate.score * 0.6 + quality * 0.4).toFixed(2)
    );

    if (dossier.sentimentLabel === "negativo") {
      approved = false;
      reasons.push("Fluxo de notícias predominantemente negativo nos últimos 30 dias");
    }
    if (severeFlags >= 2) {
      approved = false;
      reasons.push(
        `${severeFlags} bandeiras de risco estruturais simultâneas (${dossier.riskFlags.slice(0, 2).join("; ")})`
      );
    }
    if (
      (candidate.priceToBook ?? 0) > 4 &&
      (candidate.roe ?? 0) < 40
    ) {
      approved = false;
      reasons.push(
        `P/VP ${candidate.priceToBook?.toFixed(1)} não justificado pelo ROE ${candidate.roe?.toFixed(1)}%`
      );
    }
    if (approved && compositeScore < 6) {
      approved = false;
      reasons.push(
        `Score composto ${compositeScore.toFixed(2)} abaixo da régua mínima de 6,00`
      );
    }

    if (approved) {
      reasons.push(
        `Consistência validada: nota triagem ${candidate.score.toFixed(2)} × contexto ${quality.toFixed(2)}`
      );
      logger.success(
        `✓ ${candidate.ticker} validado — score composto ${compositeScore.toFixed(2)}`
      );
    } else {
      logger.warn(`✗ ${candidate.ticker} CORTADO: ${reasons[0]}`);
    }

    verdicts.push({
      ticker: candidate.ticker,
      approved,
      compositeScore,
      reasons,
    });
  }

  const approvedTickers = verdicts.filter((v) => v.approved).map((v) => v.ticker);
  const cutRate =
    verdicts.length > 0
      ? Number(
          (
            ((verdicts.length - approvedTickers.length) / verdicts.length) *
            100
          ).toFixed(1)
        )
      : 0;

  logger.data(
    `Auditoria concluída: ${approvedTickers.length}/${verdicts.length} aprovados (taxa de corte ${cutRate}%)`
  );
  logger.success(`Finalistas: ${approvedTickers.join(", ")}`);

  return {
    logs: logger.flush(),
    result: { verdicts, approvedTickers, cutRate },
  };
}

export function runDREEngine(auditor: AuditorResult): {
  logs: AgentLogEntry[];
  result: DREResult;
} {
  const logger = new AgentLogger();
  logger.info(
    `Solicitando demonstrações financeiras das ${auditor.approvedTickers.length} finalistas à base fundamentalista...`
  );

  const analyses: DREAnalysis[] = [];

  for (const ticker of auditor.approvedTickers) {
    const asset = findMarketAsset(ticker);
    if (!asset || asset.semesterResults.length === 0) {
      logger.warn(`⚑ ${ticker}: balanço semestral indisponível — excluído por prudência`);
      continue;
    }

    const [latest, , yearAgo] = asset.semesterResults;
    const growth =
      yearAgo !== undefined
        ? Number(
            (
              ((latest.netIncomeBn - yearAgo.netIncomeBn) / yearAgo.netIncomeBn) *
              100
            ).toFixed(1)
          )
        : null;

    const marginDelta =
      yearAgo !== undefined
        ? latest.netMarginPercent - yearAgo.netMarginPercent
        : 0;
    const marginTrend: DREAnalysis["marginTrend"] =
      marginDelta > 0.5 ? "expansão" : marginDelta < -0.5 ? "compressão" : "estável";

    const nde = asset.netDebtToEbitda;
    const isFinancial = nde === null;
    const isRegulatedUtility = /Transmissão|Geração|Saneamento/.test(asset.sector);

    let leverageAssessment: string;
    let balanceScore: number;
    if (isFinancial) {
      leverageAssessment = "Métrica não aplicável (instituição financeira/seguradora)";
      balanceScore = 8;
    } else if (nde < 1) {
      leverageAssessment = `Dív.Líq/EBITDA ${nde.toFixed(1)}x — balanço desalavancado`;
      balanceScore = 9;
    } else if (nde <= 2) {
      leverageAssessment = `Dív.Líq/EBITDA ${nde.toFixed(1)}x — alavancagem confortável`;
      balanceScore = 8;
    } else if (nde <= 3) {
      leverageAssessment = `Dív.Líq/EBITDA ${nde.toFixed(1)}x — alavancagem moderada`;
      balanceScore = 7;
    } else if (nde <= 3.5 && isRegulatedUtility) {
      leverageAssessment = `Dív.Líq/EBITDA ${nde.toFixed(1)}x — elevada, mitigada por receita regulada`;
      balanceScore = 5.5;
    } else {
      leverageAssessment = `Dív.Líq/EBITDA ${nde.toFixed(1)}x — alavancagem excessiva`;
      balanceScore = 3;
    }

    const growthScore =
      growth === null ? 5 : clamp(5 + (growth / 20) * 5, 0, 10);
    const marginScore =
      marginTrend === "expansão" ? 9 : marginTrend === "estável" ? 7 : 4;
    const dreScore = Number(
      (growthScore * 0.4 + marginScore * 0.3 + balanceScore * 0.3).toFixed(2)
    );

    const failedGrowth = growth !== null && growth < 0;
    const failedLeverage = !isFinancial && nde > 3.5 && !isRegulatedUtility;
    const passed = !failedGrowth && !failedLeverage;

    const notes: string[] = [
      `Lucro líquido ${latest.period}: R$ ${latest.netIncomeBn.toFixed(1)} bi (${growth === null ? "sem base comparativa" : `${growth >= 0 ? "+" : ""}${growth}% YoY`})`,
      `Margem líquida ${latest.netMarginPercent.toFixed(1)}% — tendência de ${marginTrend}`,
      leverageAssessment,
    ];

    if (failedGrowth) {
      notes.push("REPROVADA: lucro líquido em contração na comparação anual");
      logger.warn(
        `✗ ${ticker} reprovado no DRE: lucro em queda de ${growth}% YoY`
      );
    } else {
      logger.success(
        `✓ ${ticker} — LL ${latest.period} R$ ${latest.netIncomeBn.toFixed(1)} bi (${growth === null ? "n/d" : `${growth >= 0 ? "+" : ""}${growth}%`} YoY) · margem ${latest.netMarginPercent.toFixed(1)}% (${marginTrend}) · DRE-score ${dreScore.toFixed(2)}`
      );
    }

    analyses.push({
      ticker,
      period: latest.period,
      netIncomeBn: latest.netIncomeBn,
      netIncomeYoYGrowth: growth,
      netMarginPercent: latest.netMarginPercent,
      marginTrend,
      netDebtToEbitda: nde,
      leverageAssessment,
      dreScore,
      passed,
      notes,
    });
  }

  const finalists = analyses.filter((a) => a.passed).map((a) => a.ticker);
  logger.data(
    `Análise de DRE concluída: ${finalists.length}/${analyses.length} empresas com fundamentos de balanço aprovados`
  );

  return {
    logs: logger.flush(),
    result: { analyses, finalists },
  };
}

const MACRO_BY_SECTOR: Array<{ pattern: RegExp; text: string }> = [
  {
    pattern: /Petróleo/i,
    text: "Com o Brent sustentado pela disciplina de oferta da OPEP+ e o real ainda depreciado frente ao dólar, produtoras integradas capturam margens elevadas em reais. A tese de renda se beneficia do ciclo de caixa forte, enquanto a Selic em trajetória de queda reduz o custo de oportunidade dos dividendos de dois dígitos frente à renda fixa.",
  },
  {
    pattern: /Mineração/i,
    text: "A demanda chinesa por minério segue como principal variável, mas estímulos de infraestrutura em Pequim e a oferta global disciplinada dão suporte ao preço. O câmbio depreciado amplifica a receita exportadora em reais, e o encerramento de passivos judiciais reduz o prêmio de risco específico.",
  },
  {
    pattern: /Bancos/i,
    text: "O ciclo de afrouxamento monetário comprime spreads, porém reduz inadimplência e destrava crescimento de carteira. Bancos com ROE acima do custo de capital e índice de eficiência em melhora tendem a se beneficiar da reprecificação do crédito e da expansão de receitas de serviços em um cenário de atividade resiliente.",
  },
  {
    pattern: /Seguros/i,
    text: "Seguradoras ligadas a bancassurance operam com caixa líquido e alta conversão de prêmio em lucro. A queda gradual da Selic pressiona o resultado financeiro, mas é mais que compensada pelo crescimento de prêmios emitidos com desemprego em mínimas históricas e penetração de seguros ainda baixa no Brasil.",
  },
  {
    pattern: /Energia|Transmissão|Geração/i,
    text: "Receitas reguladas indexadas à inflação (RAP/contratos longos) funcionam como proxy de NTN-B com prêmio. Com o IPCA convergindo à meta e juros reais em queda, o valor presente desses fluxos se expande — enquanto a demanda por eletrificação e data centers sustenta o ciclo de investimento do setor.",
  },
  {
    pattern: /Telecomunicações/i,
    text: "Mercado móvel racionalizado pós-consolidação permite repasses de preço acima da inflação. A geração de caixa é direcionada a dividendos e reduções de capital, e o setor mostra resiliência defensiva em cenários de desaceleração da atividade doméstica.",
  },
  {
    pattern: /Saneamento/i,
    text: "O novo marco do saneamento e as metas de universalização até 2033 garantem pipeline plurianual de investimentos com retorno regulatório. Reajustes tarifários homologados e a agenda de privatizações estaduais adicionam opcionalidade de destravamento de valor às estatais do setor.",
  },
  {
    pattern: /Holding/i,
    text: "Holdings com desconto excessivo sobre o valor de mercado das participações oferecem margem de segurança adicional. A rotação de portfólio e a simplificação societária tendem a comprimir o desconto, enquanto o fluxo de dividendos das investidas sustenta a remuneração ao acionista mesmo em cenários adversos.",
  },
];

function macroJustificationFor(sector: string): string {
  const match = MACRO_BY_SECTOR.find((m) => m.pattern.test(sector));
  return (
    match?.text ??
    "O ativo combina geração de caixa resiliente e valuation descontado frente à média histórica, característica favorável no atual estágio do ciclo econômico brasileiro, com desinflação em curso e afrouxamento monetário gradual ampliando o apetite por ativos de risco domésticos."
  );
}

export function runComiteEngine(
  triagem: TriagemResult,
  pesquisa: PesquisaResult,
  auditor: AuditorResult,
  dre: DREResult
): { logs: AgentLogEntry[]; result: ComiteResult } {
  const logger = new AgentLogger();
  logger.info("Sessão do comitê aberta — consolidando notas de todos os agentes...");

  const candidateMap = new Map(triagem.candidates.map((c) => [c.ticker, c]));
  const dossierMap = new Map(pesquisa.dossiers.map((d) => [d.ticker, d]));
  const verdictMap = new Map(auditor.verdicts.map((v) => [v.ticker, v]));
  const dreMap = new Map(dre.analyses.map((a) => [a.ticker, a]));

  const scored = dre.finalists
    .map((ticker) => {
      const candidate = candidateMap.get(ticker);
      const dossier = dossierMap.get(ticker);
      const verdict = verdictMap.get(ticker);
      const analysis = dreMap.get(ticker);
      if (!candidate || !dossier || !verdict || !analysis) return null;

      const quality = contextQuality(dossier);
      const finalScore = Number(
        (
          candidate.score * 0.35 +
          quality * 0.25 +
          analysis.dreScore * 0.4
        ).toFixed(2)
      );
      return { ticker, candidate, dossier, analysis, finalScore };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null
    )
    .sort((a, b) => b.finalScore - a.finalScore);

  logger.data(
    `Matriz de decisão montada: ${scored.length} finalistas com score consolidado (35% triagem · 25% contexto · 40% DRE)`
  );

  const top5 = scored.slice(0, 5);
  const scoreSum = top5.reduce((acc, e) => acc + e.finalScore, 0);

  let allocated = 0;
  const picks: CommitteePick[] = top5.map((entry, index) => {
    const isLast = index === top5.length - 1;
    const rawAllocation = scoreSum > 0 ? (entry.finalScore / scoreSum) * 100 : 20;
    const allocation = isLast
      ? Math.max(100 - allocated, 0)
      : Math.round(rawAllocation);
    allocated += allocation;

    const asset = findMarketAsset(entry.ticker);
    const growth = entry.analysis.netIncomeYoYGrowth;

    const thesis = `${entry.candidate.name} combina DY de ${entry.candidate.dividendYield.toFixed(1)}% com lucro líquido ${growth === null ? "estável" : `crescendo ${growth >= 0 ? "+" : ""}${growth}% YoY`} e margem líquida de ${entry.analysis.netMarginPercent.toFixed(1)}% em ${entry.analysis.marginTrend}. ${entry.analysis.leverageAssessment}. Governança ${entry.dossier.governance} com fluxo de notícias ${entry.dossier.sentimentLabel}.`;

    logger.success(
      `#${index + 1} ${entry.ticker} — score final ${entry.finalScore.toFixed(2)} · alocação sugerida ${allocation}%`
    );

    return {
      rank: index + 1,
      ticker: entry.ticker,
      name: entry.candidate.name,
      sector: entry.candidate.sector,
      finalScore: entry.finalScore,
      currentPrice: entry.candidate.price,
      dividendYield: entry.candidate.dividendYield,
      suggestedAllocationPercent: allocation,
      thesis,
      macroJustification: macroJustificationFor(entry.candidate.sector),
      risks: asset?.riskFlags.length ? asset.riskFlags : ["Risco de mercado sistêmico (Ibovespa)"],
    };
  });

  const marketOutlook =
    "Cenário-base do comitê: desinflação gradual com IPCA convergindo ao intervalo da meta, ciclo de corte da Selic preservando juro real ainda contracionista, e atividade doméstica resiliente puxada por mercado de trabalho aquecido. Nesse regime, o comitê privilegia empresas geradoras de caixa, pagadoras de dividendos e com receitas indexadas à inflação, mantendo diversificação setorial entre energia, financeiro, commodities e utilities como proteção contra choques fiscais domésticos e volatilidade externa.";

  const disclaimer =
    "Relatório gerado por sistema multi-agente para fins exclusivamente educacionais. Não constitui recomendação de investimento nos termos da Resolução CVM 20/2021. Rentabilidade passada não garante resultados futuros.";

  logger.success(
    `Relatório final ratificado pelo comitê: ${picks.map((p) => p.ticker).join(" · ")}`
  );

  return {
    logs: logger.flush(),
    result: {
      picks,
      marketOutlook,
      disclaimer,
      generatedAt: new Date().toISOString(),
    },
  };
}
