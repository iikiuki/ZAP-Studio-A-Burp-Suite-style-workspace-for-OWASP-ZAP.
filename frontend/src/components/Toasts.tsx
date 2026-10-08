import { useEffect, useState } from "react";
import { useApp } from "../store/app";
import { cn } from "../lib/format";

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "cursor-pointer rounded border px-3 py-2 text-xs shadow-lg backdrop-blur max-w-sm",
            t.kind === "error" && "bg-rose-950/90 border-rose-700/60 text-rose-200",
            t.kind === "success" && "bg-emerald-950/90 border-emerald-700/60 text-emerald-200",
            t.kind === "info" && "bg-ink-800/95 border-ink-600 text-slate-200",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Tiny hook that polls an async loader on an interval. */
export function usePolling<T>(loader: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const result = await loader();
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const timer = intervalMs > 0 ? setInterval(tick, intervalMs) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, reload: () => loader().then(setData) };
}
