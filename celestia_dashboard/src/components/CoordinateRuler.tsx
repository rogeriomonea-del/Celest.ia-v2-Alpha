const TICKS = Array.from({ length: 37 }, (_, index) => index)

/**
 * Decorative latitude telemetry used on the left edge of the hero.
 * It deliberately carries no product information and stays out of the
 * accessibility tree.
 */
export function CoordinateRuler() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-[4.6rem] select-none border-r border-aqua-200/[0.09] text-space-200/50 xl:block"
    >
      <div className="absolute left-7 top-7 font-mono text-[9px] uppercase leading-5 tracking-[0.18em]">
        <span className="block text-aqua-100/55">N</span>
        <span className="block">00°</span>
      </div>

      <div className="absolute bottom-[10.75rem] left-8 top-[5.25rem] w-5">
        <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-aqua-200/25 via-aqua-200/10 to-aqua-200/20" />
        <div className="absolute inset-y-0 left-0 w-full">
          {TICKS.map((tick) => (
            <span
              key={tick}
              className={`absolute left-0 h-px bg-space-200/35 ${
                tick % 6 === 0 ? 'w-3' : tick % 3 === 0 ? 'w-2' : 'w-1'
              }`}
              style={{ top: `${(tick / (TICKS.length - 1)) * 100}%` }}
            />
          ))}
        </div>

        <span className="absolute left-[-3px] top-[8%] h-[7px] w-[7px] rounded-full border border-aqua-100/70 bg-aqua-300 shadow-[0_0_0_4px_rgba(85,230,230,0.08),0_0_14px_rgba(85,230,230,0.75)]" />
        <span className="absolute left-0 top-[43%] h-10 w-px -translate-y-1/2 bg-aqua-100/40" />
        <span className="absolute left-0 top-[70%] h-9 w-px -translate-y-1/2 bg-aqua-100/30" />
      </div>

      <div className="absolute inset-x-0 bottom-[10.1rem] top-[5.25rem] font-mono text-[8px] tracking-[0.08em]">
        <span className="absolute left-7 top-[28%]">30°</span>
        <span className="absolute left-7 top-[43%] flex items-center gap-1 text-aqua-50/70">
          00°
          <span className="h-0 w-0 border-b-[3px] border-l-[5px] border-t-[3px] border-b-transparent border-l-aqua-100/80 border-t-transparent" />
        </span>
        <span className="absolute left-7 top-[57%]">30°</span>
        <span className="absolute left-7 top-[75%]">60°</span>
      </div>

      <div className="absolute bottom-[9.4rem] left-7 font-mono text-[9px] uppercase leading-5 tracking-[0.18em]">
        <span className="block text-aqua-100/55">S</span>
        <span className="block">90°</span>
      </div>

      <div className="absolute bottom-5 left-6 font-mono text-[7px] uppercase leading-4 tracking-[0.16em] text-space-200/35">
        <span className="block">MSSN</span>
        <span className="block text-[10px] text-aqua-200/65">07</span>
      </div>
    </div>
  )
}
