import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone?: "default" | "profit" | "loss";
}

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "break-words text-xl font-semibold leading-tight tabular-nums tracking-tight xl:text-[1.35rem]",
              tone === "profit" && "text-profit",
              tone === "loss" && "text-loss"
            )}
          >
            {value}
          </p>
          {helper && (
            <p className="text-xs text-muted-foreground/80">{helper}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
            tone === "profit" && "bg-profit/10 text-profit ring-profit/20",
            tone === "loss" && "bg-loss/10 text-loss ring-loss/20",
            tone === "default" && "bg-white/5 text-muted-foreground ring-white/10"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
