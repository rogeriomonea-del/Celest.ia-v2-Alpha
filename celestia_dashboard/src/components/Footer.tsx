import { Orbit } from 'lucide-react'

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-aqua-200/10 bg-[#00020d] text-space-100">
      <div aria-hidden="true" className="absolute inset-0 starfield opacity-25" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aqua-300/45 to-gold-300/35" />
      <div className="relative mx-auto grid max-w-[90rem] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04]">
              <Orbit className="h-4 w-4 text-aqua-200" aria-hidden="true" />
            </span>
            <span className="font-serif text-xl font-medium text-[#fff8e9]">celest<span className="text-gold-300">.ia</span></span>
          </div>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-space-200">
            Inteligência de rota para comparar dinheiro, milhas e upgrade. Tarifas indicativas devem ser confirmadas no canal de reserva antes da compra.
          </p>
        </div>
        <div className="text-left md:text-right">
          <nav aria-label="Rodapé" className="mb-3 flex gap-5 text-xs font-semibold text-space-100 md:justify-end">
            <a href="#buscar" className="rounded hover:text-aqua-200">Nova busca</a>
            <a href="#resultados" className="rounded hover:text-aqua-200">Resultados</a>
          </nav>
          <p className="text-[11px] text-space-200/80">© {new Date().getFullYear()} celest.ia · Navegue melhor.</p>
        </div>
      </div>
    </footer>
  )
}
