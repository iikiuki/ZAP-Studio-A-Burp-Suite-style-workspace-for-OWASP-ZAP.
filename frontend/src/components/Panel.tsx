import { cn } from "../lib/format";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, actions, children, className }: Props) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="toolbar justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-200">{title}</span>
          {subtitle && <span className="text-2xs text-slate-500">{subtitle}</span>}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="text-2xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", accent ?? "text-slate-100")}>{value}</div>
      {hint && <div className="text-2xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <div className="text-sm text-slate-400">{title}</div>
      {hint && <div className="text-2xs text-slate-600">{hint}</div>}
    </div>
  );
}
