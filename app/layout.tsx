import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
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
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <AppStoreProvider>
          <Sidebar />
          <main className="min-h-screen pt-14 lg:pl-64 lg:pt-0">
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
              {children}
            </div>
          </main>
        </AppStoreProvider>
      </body>
    </html>
  );
}
