import { Sparkles } from "lucide-react";

/** Rodapé no estilo Celestia Flights: institucional + avisos de fonte. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600">
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <span className="font-extrabold tracking-tight text-foreground">
            celest<span className="text-primary">.ia</span>
          </span>
          <span className="text-xs">· Investment Intelligence OS</span>
        </div>
        <div className="max-w-xl space-y-1 text-xs leading-relaxed">
          <p>
            Dados de fontes oficiais (CVM, B3, Tesouro Transparente, BCB)
            processados pelo backend determinístico; toda métrica carrega
            fonte e data-base. Preços da B3 não ajustados por proventos.
          </p>
          <p>
            Conteúdo informativo e educacional — não é recomendação de
            investimento nem oferta de valores mobiliários.
          </p>
        </div>
      </div>
    </footer>
  );
}
