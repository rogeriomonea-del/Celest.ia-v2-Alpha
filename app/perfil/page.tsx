"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Gauge,
  RotateCcw,
  Shield,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import type {
  AssetClass,
  ProfileAnswer,
  ProfileResult,
  RiskProfile,
} from "@/lib/types";
import { cn, formatPercentPlain } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface QuizOption {
  label: string;
  score: number;
}

interface QuizQuestion {
  id: number;
  title: string;
  subtitle: string;
  options: QuizOption[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    title: "Por quanto tempo pretende manter seus investimentos aplicados?",
    subtitle: "Horizonte de investimento",
    options: [
      { label: "Menos de 1 ano — posso precisar do dinheiro a qualquer momento", score: 1 },
      { label: "Entre 1 e 3 anos", score: 2 },
      { label: "Entre 3 e 10 anos", score: 3 },
      { label: "Mais de 10 anos — foco em longo prazo e aposentadoria", score: 4 },
    ],
  },
  {
    id: 2,
    title: "Qual é o principal objetivo do seu patrimônio?",
    subtitle: "Objetivo financeiro",
    options: [
      { label: "Preservar capital — não posso perder o que já tenho", score: 1 },
      { label: "Gerar renda recorrente com dividendos e juros", score: 2 },
      { label: "Equilibrar renda e crescimento do patrimônio", score: 3 },
      { label: "Maximizar crescimento, mesmo com fortes oscilações", score: 4 },
    ],
  },
  {
    id: 3,
    title: "Qual sua experiência com renda variável (ações, FIIs, ETFs)?",
    subtitle: "Conhecimento e experiência",
    options: [
      { label: "Nenhuma — só investi em poupança/CDB", score: 1 },
      { label: "Iniciante — comecei há menos de 1 ano", score: 2 },
      { label: "Intermediária — invisto há alguns anos e acompanho o mercado", score: 3 },
      { label: "Avançada — opero ativamente e entendo derivativos", score: 4 },
    ],
  },
  {
    id: 4,
    title: "Sua carteira cai 20% em um mês durante uma crise. O que você faz?",
    subtitle: "Tolerância a perdas",
    options: [
      { label: "Vendo tudo imediatamente para estancar a perda", score: 1 },
      { label: "Vendo uma parte e espero o cenário melhorar", score: 2 },
      { label: "Mantenho as posições e sigo o plano original", score: 3 },
      { label: "Compro mais, aproveitando os preços descontados", score: 4 },
    ],
  },
  {
    id: 5,
    title: "Que percentual da sua renda mensal você consegue investir?",
    subtitle: "Capacidade de poupança",
    options: [
      { label: "Até 5% — orçamento apertado", score: 1 },
      { label: "Entre 5% e 15%", score: 2 },
      { label: "Entre 15% e 30%", score: 3 },
      { label: "Acima de 30% — alta capacidade de aporte", score: 4 },
    ],
  },
  {
    id: 6,
    title: "Você possui reserva de emergência (6+ meses de despesas)?",
    subtitle: "Segurança financeira",
    options: [
      { label: "Não tenho reserva de emergência", score: 1 },
      { label: "Tenho menos de 3 meses de despesas guardados", score: 2 },
      { label: "Tenho entre 3 e 6 meses em liquidez imediata", score: 3 },
      { label: "Tenho mais de 6 meses e sobra capital para risco", score: 4 },
    ],
  },
  {
    id: 7,
    title: "Qual cenário de retorno anual mais combina com você?",
    subtitle: "Relação risco × retorno",
    options: [
      { label: "Ganhar 9% com risco quase zero (100% renda fixa)", score: 1 },
      { label: "Ganhar 12% podendo oscilar até -5% no ano", score: 2 },
      { label: "Ganhar 18% podendo oscilar até -15% no ano", score: 3 },
      { label: "Ganhar 30%+ aceitando quedas superiores a -30%", score: 4 },
    ],
  },
];

const MAX_SCORE = QUESTIONS.length * 4;

const PROFILE_ALLOCATIONS: Record<RiskProfile, Record<AssetClass, number>> = {
  Conservador: {
    "Renda Fixa": 70,
    "Ações": 10,
    FIIs: 10,
    ETFs: 5,
    BDRs: 0,
    Caixa: 5,
  },
  Moderado: {
    "Renda Fixa": 40,
    "Ações": 25,
    FIIs: 15,
    ETFs: 10,
    BDRs: 5,
    Caixa: 5,
  },
  Arrojado: {
    "Renda Fixa": 15,
    "Ações": 45,
    FIIs: 15,
    ETFs: 10,
    BDRs: 10,
    Caixa: 5,
  },
};

const PROFILE_DESCRIPTIONS: Record<RiskProfile, string> = {
  Conservador:
    "Prioriza a preservação do capital e a previsibilidade. A maior parte da carteira deve permanecer em renda fixa pós-fixada e títulos indexados à inflação, com exposição residual e gradual à renda variável de qualidade.",
  Moderado:
    "Aceita oscilações controladas em troca de retornos superiores à renda fixa no médio prazo. Combina uma base sólida de renda fixa com posições relevantes em ações pagadoras de dividendos, FIIs e diversificação internacional.",
  Arrojado:
    "Busca maximizar o crescimento do patrimônio no longo prazo e tolera alta volatilidade. Concentra a alocação em renda variável doméstica e internacional, usando a renda fixa como reserva tática de oportunidade.",
};

function classifyScore(score: number): RiskProfile {
  if (score <= 13) return "Conservador";
  if (score <= 20) return "Moderado";
  return "Arrojado";
}

const PROFILE_ICON: Record<RiskProfile, typeof Shield> = {
  Conservador: Shield,
  Moderado: Gauge,
  Arrojado: TrendingUp,
};

export default function PerfilPage() {
  const { profile, hydrated, saveProfile, clearProfile } = useAppStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<ProfileAnswer[]>([]);
  const [transitioning, setTransitioning] = useState(false);

  const question = QUESTIONS[currentIndex];
  const progressPercent = (currentIndex / QUESTIONS.length) * 100;

  const selectedForCurrent = useMemo(
    () => answers.find((a) => a.questionId === question?.id)?.optionIndex,
    [answers, question]
  );

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (transitioning || !question) return;
      const option = question.options[optionIndex];
      const nextAnswers: ProfileAnswer[] = [
        ...answers.filter((a) => a.questionId !== question.id),
        { questionId: question.id, optionIndex, score: option.score },
      ];
      setAnswers(nextAnswers);
      setTransitioning(true);

      window.setTimeout(() => {
        if (currentIndex < QUESTIONS.length - 1) {
          setCurrentIndex((index) => index + 1);
          setTransitioning(false);
        } else {
          const score = nextAnswers.reduce((acc, a) => acc + a.score, 0);
          const riskProfile = classifyScore(score);
          const result: ProfileResult = {
            profile: riskProfile,
            score,
            maxScore: MAX_SCORE,
            completedAt: new Date().toISOString(),
            answers: nextAnswers.sort((a, b) => a.questionId - b.questionId),
            recommendedAllocation: PROFILE_ALLOCATIONS[riskProfile],
          };
          saveProfile(result);
          setTransitioning(false);
        }
      }, 320);
    },
    [answers, currentIndex, question, saveProfile, transitioning]
  );

  const restart = useCallback(() => {
    clearProfile();
    setAnswers([]);
    setCurrentIndex(0);
  }, [clearProfile]);

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96 max-w-2xl" />
      </div>
    );
  }

  if (profile) {
    const Icon = PROFILE_ICON[profile.profile];
    const allocationEntries = (
      Object.entries(profile.recommendedAllocation) as Array<[AssetClass, number]>
    ).filter(([, percent]) => percent > 0);

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <UserRound className="h-6 w-6 text-primary" />
            Perfil do Investidor
          </h1>
          <p className="text-sm text-muted-foreground">
            Resultado do questionário de suitability — salvo nesta sessão.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="animate-fade-in-up">
            <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Seu perfil é
                </p>
                <p className="text-3xl font-semibold tracking-tight text-primary">
                  {profile.profile}
                </p>
              </div>
              <div className="w-full space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Pontuação</span>
                  <span className="tabular-nums">
                    {profile.score} / {profile.maxScore}
                  </span>
                </div>
                <Progress value={(profile.score / profile.maxScore) * 100} />
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  <span>Conservador</span>
                  <span>Moderado</span>
                  <span>Arrojado</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {PROFILE_DESCRIPTIONS[profile.profile]}
              </p>
              <Button variant="outline" onClick={restart}>
                <RotateCcw className="h-4 w-4" />
                Refazer questionário
              </Button>
            </CardContent>
          </Card>

          <Card className="animate-fade-in-up">
            <CardHeader>
              <CardTitle className="text-base">
                Alocação recomendada por classe
              </CardTitle>
              <CardDescription>
                Ponto de partida sugerido para o seu perfil — use na tela de
                Rebalanceamento como porcentagem alvo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {allocationEntries.map(([assetClass, percent]) => (
                <div key={assetClass} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>{assetClass}</span>
                    <span className="font-medium tabular-nums">
                      {formatPercentPlain(percent, 0)}
                    </span>
                  </div>
                  <Progress value={percent} />
                </div>
              ))}
              <p className="pt-2 text-xs leading-relaxed text-muted-foreground/70">
                Concluído em{" "}
                {new Date(profile.completedAt).toLocaleString("pt-BR")} ·
                Questionário educacional, não substitui a análise de
                suitability exigida pela regulação CVM.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserRound className="h-6 w-6 text-primary" />
          Perfil do Investidor
        </h1>
        <p className="text-sm text-muted-foreground">
          Responda 7 perguntas para descobrir se você é Conservador, Moderado ou
          Arrojado.
        </p>
      </div>

      <div className="max-w-2xl space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Pergunta {currentIndex + 1} de {QUESTIONS.length}
            </span>
            <span className="tabular-nums">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} />
        </div>

        <Card
          key={question.id}
          className={cn(
            "animate-fade-in-up",
            transitioning && "pointer-events-none opacity-60"
          )}
        >
          <CardHeader>
            <Badge variant="muted" className="w-fit">
              {question.subtitle}
            </Badge>
            <CardTitle className="pt-2 text-lg leading-snug">
              {question.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {question.options.map((option, index) => {
              const isSelected = selectedForCurrent === index;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => handleAnswer(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all",
                    isSelected
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-white/10 bg-surface hover:border-white/25 hover:bg-white/[0.03]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/20"
                    )}
                  >
                    {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </span>
                  {option.label}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {currentIndex > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            disabled={transitioning}
          >
            <ArrowLeft className="h-4 w-4" />
            Pergunta anterior
          </Button>
        )}
      </div>
    </div>
  );
}
