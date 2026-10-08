import { useEffect, useRef } from "react";
import { useApp } from "../store/app";
import { api } from "../api/client";
import { cn, methodColor, statusColor } from "../lib/format";

/**
 * Global status bar mirroring Burp's bottom strip: ZAP health, proxy address,
 * live history/alert counters and the intercept switch.
 */
export function StatusBar() {
  const status = useApp((s) => s.status);
  const setStatus = useApp((s) => s.setStatus);
  const historyCount = useApp((s) => s.historyCount);
  const alertCount = useApp((s) => s.alertCount);
  const intercepting = useApp((s) => s.intercepting);
  const setIntercepting = useApp((s) => s.setIntercepting);
  const toast = useApp((s) => s.toast);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      try {
        const s = await api.system.status();
        if (mounted.current) setStatus(s);
      } catch {
        if (mounted.current) setStatus(null);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [setStatus]);

  const toggleIntercept = async () => {
    try {
      const next = !intercepting;
      await api.proxy.setIntercept(next);
      setIntercepting(next);
      toast("info", next ? "Intercept ON — requests will be held" : "Intercept OFF");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to toggle intercept");
    }
  };

  const running = status?.running ?? false;
  const proxy = status?.proxy;

  return (
    <div className="flex h-7 items-center gap-3 border-t border-ink-700/70 bg-ink-900 px-3 text-2xs text-slate-400">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            running ? "bg-emerald-400" : "bg-rose-500 animate-pulse-soft",
          )}
        />
        <span className="font-medium text-slate-300">ZAP</span>
        <span className="font-mono">{status?.version ?? "offline"}</span>
        {status?.external && <span className="chip bg-ink-700 text-slate-400">attached</span>}
      </span>

      <span className="h-3 w-px bg-ink-700" />

      <span className="flex items-center gap-1.5">
        <span className="text-slate-500">Proxy</span>
        <span className="font-mono text-accent-400">
          {proxy ? `${proxy.address}:${proxy.port}` : "—"}
        </span>
      </span>

      <span className="h-3 w-px bg-ink-700" />

      <span className="flex items-center gap-1.5">
        <span className="text-slate-500">History</span>
        <span className={cn("font-mono", methodColor("GET"))}>{historyCount}</span>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="text-slate-500">Issues</span>
        <span className={cn("font-mono", statusColor(alertCount > 0 ? 400 : 200))}>{alertCount}</span>
      </span>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={toggleIntercept}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-0.5 font-medium transition-colors",
            intercepting
              ? "bg-brand-500 text-ink-950"
              : "bg-ink-700 text-slate-300 hover:bg-ink-600",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", intercepting ? "bg-ink-950" : "bg-slate-500")} />
          Intercept {intercepting ? "ON" : "OFF"}
        </button>
        <span className="text-slate-600">{status?.platform}</span>
      </div>
    </div>
  );
}
