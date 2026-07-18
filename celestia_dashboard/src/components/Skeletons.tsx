/** Pulsing placeholders shown while the search "runs" — perceived speed over spinners. */

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
}

export function FlightCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto] md:gap-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200" />
          <div className="flex-1 space-y-2">
            <Bar className="h-5 w-36" />
            <Bar className="h-3 w-44" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Bar className="h-3 w-16" />
          <Bar className="h-px w-full" />
          <Bar className="h-3 w-24" />
        </div>
        <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
          <div className="space-y-2">
            <Bar className="h-7 w-28" />
            <Bar className="h-3 w-16" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
    </div>
  )
}

export function SortTabsSkeleton() {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-2 px-5 py-3">
          <Bar className="h-4 w-20" />
          <Bar className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export function FilterSidebarSkeleton() {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Bar className="h-5 w-24" />
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-3">
          <Bar className="h-3 w-20" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-5/6" />
          <Bar className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
}
