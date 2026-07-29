"use client";

/**
 * Pergunte à IA (Fase 7): chat sobre o Investment Intelligence OS via
 * POST /v1/chat. O LLM do backend NUNCA calcula números — apenas orquestra
 * ferramentas determinísticas (com fonte e data-base) e devolve uma resposta
 * ESTRUTURADA: evidências, fontes, premissas, confiança, riscos,
 * contra-argumento, dados ausentes e gatilhos de revisão, sempre exibidos.
 *
 * 503 `chat_indisponivel` = backend sem ANTHROPIC_API_KEY → estado dedicado
 * (nenhuma outra tela depende dessa chave).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  KeyRound,
  Loader2,
  MessagesSquare,
  Scale,
  SendHorizonal,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHAT_PERGUNTA_MAX,
  CHAT_PERGUNTA_MIN,
  askChat,
  errorMessage,
  fetchChatFerramentas,
  isApiError,
  type ChatFerramentas,
  type ChatMensagem,
  type ChatResposta,
  type ChatRespostaEstruturada,
} from "@/lib/api/investment-os";
import {
  ApiErrorState,
  ApiPageHeader,
  ConfidenceBadge,
  UnavailableValue,
  formatDateBR,
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_DESCRIPTION =
  "Assistente conversacional sobre o sistema: screener, Tesouro Direto, macro e ativos. Cada resposta vem estruturada com evidências, fontes, data-base, premissas, riscos e contra-argumento.";

const AVISO_PERMANENTE =
  "O assistente não calcula números: tudo vem de ferramentas determinísticas com fonte e data-base. Não é recomendação de investimento.";

/** Quantas mensagens anteriores são reenviadas como contexto (`historico`). */
const HISTORICO_ENVIADO = 10;

const SUGESTOES = [
  "Quais empresas passaram no screener?",
  "Como está o radar do Tesouro IPCA+?",
  "Explique P/L",
  "Desafie a tese de GMAT3",
];

/** Turno da conversa mantido no cliente. */
interface Turno {
  id: number;
  role: "user" | "assistant";
  /** Pergunta do usuário ou resposta_direta (para reenvio no histórico). */
  content: string;
  /** Presente apenas em turnos do assistente. */
  resposta?: ChatResposta;
}

function ListaBloco({
  titulo,
  itens,
  vazio,
}: {
  titulo: string;
  itens: string[];
  vazio: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      {itens.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground/70">{vazio}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {itens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RespostaEstruturadaBlocos({
  resposta,
  ferramentas,
  modelo,
}: {
  resposta: ChatRespostaEstruturada;
  ferramentas: ChatResposta["ferramentas_chamadas"];
  modelo: string;
}) {
  const respostaVazia = resposta.resposta_direta.trim().length === 0;

  return (
    <div className="space-y-3">
      {/* Resposta direta em destaque + selo de confiança */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Resposta direta
          </p>
          <ConfidenceBadge value={resposta.confianca} />
        </div>
        {respostaVazia ? (
          <p className="mt-2 text-sm">
            <UnavailableValue label="O assistente retornou uma resposta vazia" />
            <span className="block text-xs text-muted-foreground">
              Reformule a pergunta ou verifique os blocos de dados ausentes e
              ferramentas consultadas abaixo.
            </span>
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {resposta.resposta_direta}
          </p>
        )}
      </div>

      {/* Evidências */}
      <div className="rounded-xl border border-border bg-surface-raised p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Evidências
        </p>
        {resposta.evidencias.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground/70">
            Nenhuma evidência citada nesta resposta.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Afirmação</TableHead>
                <TableHead scope="col">Valor</TableHead>
                <TableHead scope="col">Fonte</TableHead>
                <TableHead scope="col">Data-base</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resposta.evidencias.map((evidencia, index) => (
                <TableRow key={`${evidencia.afirmacao}-${index}`}>
                  <TableCell className="text-xs">
                    {evidencia.afirmacao}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {evidencia.valor !== undefined &&
                    evidencia.valor !== null &&
                    String(evidencia.valor).trim() !== "" ? (
                      String(evidencia.valor)
                    ) : (
                      <UnavailableValue label="—" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {evidencia.fonte}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {evidencia.data_base ? (
                      formatDateBR(evidencia.data_base)
                    ) : (
                      <UnavailableValue label="—" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Fontes + data-base */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised p-3 text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">
          Fontes:
        </span>
        {resposta.fontes.length === 0 ? (
          <UnavailableValue label="nenhuma fonte citada" />
        ) : (
          resposta.fontes.map((fonte) => (
            <Badge key={fonte} variant="outline">
              {fonte}
            </Badge>
          ))
        )}
        <span className="ml-auto text-muted-foreground">
          Data-base:{" "}
          {resposta.data_base ? (
            formatDateBR(resposta.data_base)
          ) : (
            <UnavailableValue />
          )}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ListaBloco
          titulo="Premissas"
          itens={resposta.premissas}
          vazio="Nenhuma premissa declarada."
        />
        <ListaBloco
          titulo="Riscos"
          itens={resposta.riscos}
          vazio="Nenhum risco listado."
        />
      </div>

      {/* Contra-argumento — bloco visualmente distinto */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-600">
          <Scale className="h-3.5 w-3.5" aria-hidden />
          Contra-argumento (red-team)
        </p>
        {resposta.contra_argumento.trim() === "" ? (
          <p className="mt-1 text-xs text-muted-foreground/70">
            Nenhum contra-argumento fornecido nesta resposta.
          </p>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
            {resposta.contra_argumento}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ListaBloco
          titulo="Dados ausentes"
          itens={resposta.dados_ausentes}
          vazio="Nenhuma lacuna de dados declarada."
        />
        <ListaBloco
          titulo="Gatilhos de revisão"
          itens={resposta.gatilhos_revisao}
          vazio="Nenhum gatilho de revisão declarado."
        />
      </div>

      {/* Trace de ferramentas */}
      <details className="group rounded-xl border border-border bg-surface-raised">
        <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wrench className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          Ferramentas consultadas ({ferramentas.length})
        </summary>
        <div className="border-t border-border p-3">
          {ferramentas.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">
              Nenhuma ferramenta foi chamada nesta resposta.
            </p>
          ) : (
            <ul className="space-y-2">
              {ferramentas.map((chamada, index) => (
                <li
                  key={`${chamada.ferramenta}-${index}`}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span className="font-mono">{chamada.ferramenta}</span>
                  {chamada.ok ? (
                    <Badge>ok</Badge>
                  ) : (
                    <Badge variant="destructive">
                      erro
                      {chamada.codigo_erro ? `: ${chamada.codigo_erro}` : ""}
                    </Badge>
                  )}
                  {Object.keys(chamada.argumentos).length > 0 && (
                    <code className="max-w-full overflow-x-auto whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(chamada.argumentos)}
                    </code>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Modelo: <span className="font-mono">{modelo}</span>
          </p>
        </div>
      </details>
    </div>
  );
}

/** Estado dedicado: backend sem ANTHROPIC_API_KEY (503 chat_indisponivel). */
function ChatIndisponivelState({ mensagem }: { mensagem: string }) {
  return (
    <Card role="alert" className="border-amber-300">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="font-medium">
              Assistente indisponível — chave da API não configurada no backend
            </p>
            <p className="text-sm text-muted-foreground">{mensagem}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm text-muted-foreground">
          <p>
            O chat exige a variável{" "}
            <span className="font-mono">ANTHROPIC_API_KEY</span> no arquivo{" "}
            <span className="font-mono">.env</span> do backend
            (repositório <span className="font-mono">Celest.ia-v2-Alpha</span>).
            A chave fica SOMENTE no servidor — nunca no navegador.
          </p>
          <p className="mt-1.5">
            Nenhuma outra tela depende dessa chave: screener, Tesouro, macro,
            carteira e o banco de ativos continuam funcionando normalmente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PerguntePage() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [ultimaPergunta, setUltimaPergunta] = useState<string | null>(null);

  const [ferramentas, setFerramentas] = useState<ChatFerramentas | null>(null);
  const [ferramentasErro, setFerramentasErro] = useState(false);

  const fimConversaRef = useRef<HTMLDivElement | null>(null);
  const proximoId = useRef(1);

  useEffect(() => {
    let cancelado = false;
    fetchChatFerramentas()
      .then((data) => {
        if (!cancelado) setFerramentas(data);
      })
      .catch(() => {
        if (!cancelado) setFerramentasErro(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    fimConversaRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turnos, enviando]);

  const enviar = useCallback(
    async (texto: string) => {
      const perguntaLimpa = texto.trim();
      if (
        perguntaLimpa.length < CHAT_PERGUNTA_MIN ||
        perguntaLimpa.length > CHAT_PERGUNTA_MAX ||
        enviando
      ) {
        return;
      }

      const historico: ChatMensagem[] = turnos
        .slice(-HISTORICO_ENVIADO)
        .map((turno) => ({ role: turno.role, content: turno.content }));

      setTurnos((prev) => [
        ...prev,
        { id: proximoId.current++, role: "user", content: perguntaLimpa },
      ]);
      setPergunta("");
      setUltimaPergunta(perguntaLimpa);
      setEnviando(true);
      setErro(null);

      try {
        const resposta = await askChat(perguntaLimpa, historico);
        setTurnos((prev) => [
          ...prev,
          {
            id: proximoId.current++,
            role: "assistant",
            content: resposta.resposta.resposta_direta,
            resposta,
          },
        ]);
      } catch (err) {
        setErro(err);
      } finally {
        setEnviando(false);
      }
    },
    [turnos, enviando]
  );

  const perguntaValida =
    pergunta.trim().length >= CHAT_PERGUNTA_MIN &&
    pergunta.trim().length <= CHAT_PERGUNTA_MAX;

  const erroSemChave =
    erro !== null && isApiError(erro, "chat_indisponivel") ? erro : null;

  return (
    <div className="space-y-6">
      <ApiPageHeader
        icon={MessagesSquare}
        title="Pergunte à IA"
        description={PAGE_DESCRIPTION}
      />

      {/* Aviso permanente — nunca removido */}
      <div
        role="note"
        className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
      >
        <ShieldAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          aria-hidden
        />
        <p>{AVISO_PERMANENTE}</p>
      </div>

      {/* Conversa */}
      <section aria-label="Conversa com o assistente" className="space-y-4">
        {turnos.length === 0 && !enviando && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" aria-hidden />
                Comece com uma pergunta
              </CardTitle>
              <CardDescription>
                O assistente responde apenas com dados das ferramentas
                determinísticas do backend — se um dado não existe, ele aparece
                como ausente, nunca inventado.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {SUGESTOES.map((sugestao) => (
                <button
                  key={sugestao}
                  type="button"
                  onClick={() => void enviar(sugestao)}
                  className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {sugestao}
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {turnos.map((turno) =>
          turno.role === "user" ? (
            <div key={turno.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-4 py-2.5 text-sm ring-1 ring-primary/30 sm:max-w-[70%]">
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                  Você
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{turno.content}</p>
              </div>
            </div>
          ) : (
            <div key={turno.id} className="flex">
              <div className="w-full max-w-[95%] space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" aria-hidden />
                  Assistente
                </p>
                {turno.resposta && (
                  <RespostaEstruturadaBlocos
                    resposta={turno.resposta.resposta}
                    ferramentas={turno.resposta.ferramentas_chamadas}
                    modelo={turno.resposta.modelo}
                  />
                )}
              </div>
            </div>
          )
        )}

        {enviando && (
          <div
            className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            Consultando ferramentas determinísticas do backend…
          </div>
        )}

        {erro !== null && !enviando && (
          <div aria-live="assertive">
            {erroSemChave ? (
              <ChatIndisponivelState mensagem={errorMessage(erroSemChave)} />
            ) : (
              <ApiErrorState
                error={erro}
                title={
                  isApiError(erro) && erro.status === 422
                    ? "Pergunta rejeitada pela validação do backend"
                    : undefined
                }
                onRetry={
                  ultimaPergunta
                    ? () => {
                        // Reenvia a última pergunta sem duplicar o turno do usuário.
                        setErro(null);
                        setEnviando(true);
                        const historico: ChatMensagem[] = turnos
                          .slice(0, -1)
                          .slice(-HISTORICO_ENVIADO)
                          .map((turno) => ({
                            role: turno.role,
                            content: turno.content,
                          }));
                        askChat(ultimaPergunta, historico)
                          .then((resposta) => {
                            setTurnos((prev) => [
                              ...prev,
                              {
                                id: proximoId.current++,
                                role: "assistant",
                                content: resposta.resposta.resposta_direta,
                                resposta,
                              },
                            ]);
                          })
                          .catch((err) => setErro(err))
                          .finally(() => setEnviando(false));
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}

        <div ref={fimConversaRef} />
      </section>

      {/* Campo de pergunta */}
      <Card>
        <CardContent className="p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void enviar(pergunta);
            }}
            className="space-y-2"
          >
            <Label htmlFor="pergunta">Sua pergunta</Label>
            <div className="flex items-start gap-2">
              <textarea
                id="pergunta"
                value={pergunta}
                onChange={(event) => setPergunta(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void enviar(pergunta);
                  }
                }}
                rows={2}
                maxLength={CHAT_PERGUNTA_MAX}
                placeholder="Ex.: Quais empresas passaram no screener? (Enter envia; Shift+Enter quebra linha)"
                disabled={enviando}
                className={cn(
                  "flex w-full resize-y rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm shadow-sm transition-colors",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              />
              <Button
                type="submit"
                disabled={!perguntaValida || enviando}
                aria-label="Enviar pergunta"
              >
                {enviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <SendHorizonal className="h-4 w-4" aria-hidden />
                )}
                Enviar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              Entre {CHAT_PERGUNTA_MIN} e{" "}
              {CHAT_PERGUNTA_MAX.toLocaleString("pt-BR")} caracteres. As últimas{" "}
              {HISTORICO_ENVIADO} mensagens são reenviadas como contexto; a
              conversa vive apenas neste navegador.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Ferramentas disponíveis (GET /v1/chat/ferramentas) */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer select-none rounded-xl px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wrench className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          Ferramentas determinísticas disponíveis
          {ferramentas ? ` (${ferramentas.ferramentas.length})` : ""}
        </summary>
        <div className="border-t border-border px-4 py-3">
          {ferramentas ? (
            <>
              <ul className="space-y-1.5">
                {ferramentas.ferramentas.map((ferramenta) => (
                  <li key={ferramenta.nome} className="text-xs">
                    <span className="font-mono text-foreground">
                      {ferramenta.nome}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      — {ferramenta.descricao}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground/70">
                {ferramentas.nota}
              </p>
            </>
          ) : ferramentasErro ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle
                className="h-3.5 w-3.5 text-amber-600"
                aria-hidden
              />
              Não foi possível carregar a lista de ferramentas (o chat pode
              continuar funcionando).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Carregando lista de ferramentas…
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
