import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AppStoreProvider } from "@/lib/store/app-store";

export const metadata: Metadata = {
  title: {
    default: "celest.ia — Inteligência de Investimentos",
    template: "%s · celest.ia",
  },
  description:
    "Plataforma de análise financeira multi-agente: carteira consolidada, triagem fundamentalista com IA, perfil de investidor, rebalanceamento e Open Finance.",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Root layout do App Router: a fonte vale para todas as rotas — o
            aviso no-page-custom-font só se aplica ao Pages Router. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <AppStoreProvider>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            {process.env.NEXT_PUBLIC_IIOS_DEMO === "1" && (
              <div
                role="note"
                className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800"
              >
                MODO DEMONSTRAÇÃO — todos os dados exibidos são ilustrativos e
                congelados; não são dados reais de CVM, B3, Tesouro ou BCB e
                não constituem recomendação de investimento.
              </div>
            )}
            <main className="flex-1">
              <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
            <SiteFooter />
          </div>
        </AppStoreProvider>
      </body>
    </html>
  );
}
