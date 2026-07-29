"use client";

/**
 * Header no design do Celestia Flights: barra sticky translúcida, logo com
 * gradiente indigo→violet e navegação em pills. As telas conectadas à API
 * real levam selo "API"; o protótipo antigo permanece rotulado "Simulado".
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Globe,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  description: string;
  /** "api" = dados reais do backend; "simulado" = protótipo com dados estáticos. */
  tag: "api" | "simulado";
}

/** Telas principais — pills visíveis no desktop, como no Celestia Flights. */
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/visao-geral", label: "Visão geral", description: "Screener · Tesouro · Macro · Saúde", tag: "api" },
  { href: "/tesouro", label: "Tesouro", description: "Curvas, radar e cenários MTM", tag: "api" },
  { href: "/macro", label: "Macro", description: "Regimes e séries do BCB", tag: "api" },
  { href: "/ativos", label: "Ativos B3", description: "Universo completo + cotação", tag: "api" },
  { href: "/carteira", label: "Carteira", description: "Pesos, violações e qualidade", tag: "api" },
  { href: "/pergunte", label: "Pergunte à IA", description: "Chat com evidências e fontes", tag: "api" },
];

/** Demais telas — dropdown "Mais" no desktop; tudo junto no menu mobile. */
const MORE_ITEMS: NavItem[] = [
  { href: "/politica", label: "Perfil e Política", description: "Questionário adaptativo · IPS", tag: "api" },
  { href: "/importacao", label: "Importação B3", description: "Extrato → snapshot versionado", tag: "api" },
  { href: "/plano-aportes", label: "Plano de aportes", description: "Rebalanceamento pela IPS", tag: "api" },
  { href: "/", label: "Dashboard", description: "Protótipo — carteira e indicadores", tag: "simulado" },
  { href: "/perfil", label: "Perfil", description: "Protótipo — suitability", tag: "simulado" },
  { href: "/rebalanceamento", label: "Rebalanceamento", description: "Protótipo — ajustes de alocação", tag: "simulado" },
  { href: "/organizador", label: "Organizador", description: "Protótipo — Open Finance simulado", tag: "simulado" },
];

function NavTag({ tag }: { tag: NavItem["tag"] }) {
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        tag === "api"
          ? "bg-primary/10 text-primary ring-1 ring-primary/25"
          : "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
      )}
      title={
        tag === "api"
          ? "Dados reais da API do backend Investment Intelligence OS"
          : "Protótipo com dados simulados — não tratar como dados reais"
      }
    >
      {tag === "api" ? "API" : "Simulado"}
    </span>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo() {
  return (
    <Link href="/visao-geral" className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
        <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <span className="text-lg font-extrabold tracking-tight text-foreground">
        celest<span className="text-primary">.ia</span>
      </span>
    </Link>
  );
}

function MenuLink({
  item,
  onNavigate,
  pathname,
}: {
  item: NavItem;
  onNavigate: () => void;
  pathname: string;
}) {
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
        active ? "bg-secondary" : "hover:bg-muted"
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            active ? "text-secondary-foreground" : "text-foreground"
          )}
        >
          {item.label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.description}
        </span>
      </span>
      <NavTag tag={item.tag} />
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement>(null);

  const demoMode = process.env.NEXT_PUBLIC_IIOS_DEMO === "1";

  React.useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  React.useEffect(() => {
    setMoreOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const moreActive = MORE_ITEMS.some((item) => isActivePath(pathname, item.href));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Logo />
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Principal"
          >
            {PRIMARY_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((open) => !open)}
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                  moreActive || moreOpen
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                Mais
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    moreOpen && "rotate-180"
                  )}
                  aria-hidden="true"
                />
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-80 animate-pop rounded-2xl border border-border bg-popover p-2 shadow-xl"
                >
                  {MORE_ITEMS.map((item) => (
                    <MenuLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onNavigate={() => setMoreOpen(false)}
                    />
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {demoMode && (
            <span
              className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-300"
              title="Modo demonstração: dados ilustrativos congelados, não são dados reais"
            >
              Demonstração
            </span>
          )}
          <span
            aria-label="Idioma e moeda: BRL, português (Brasil)"
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground sm:inline-flex"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            BRL · pt-BR
          </span>
          <button
            type="button"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Menu"
          className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-border bg-white px-3 py-3 shadow-xl lg:hidden"
        >
          <div className="space-y-0.5">
            {[...PRIMARY_ITEMS, ...MORE_ITEMS].map((item) => (
              <MenuLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
