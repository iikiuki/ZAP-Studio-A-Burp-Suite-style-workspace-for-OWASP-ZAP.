import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { cn } from "../../lib/format";
import { useApp } from "../../store/app";
import { Loader2, Play, Power, RotateCcw, Save, ShieldCheck, X } from "lucide-react";
import type { ZapStatus } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: Props) {
  const toast = useApp((s) => s.toast);
  const setStatus = useApp((s) => s.setStatus);
  const [status, setLocalStatus] = useState<ZapStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("zap-studio-session");

  const refresh = async () => {
    try {
      const s = await api.system.status();
      setLocalStatus(s);
      setStatus(s);
    } catch {
      setLocalStatus(null);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const act = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await fn();
      toast("success", success);
      await refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-[26rem] flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-brand-500" />
            <span className="text-sm font-semibold text-slate-100">ZAP connection</span>
          </div>
          <button className="text-slate-500 hover:text-slate-200" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 text-xs">
          <div className="panel mb-4 p-3">
            <Row label="Daemon">
              <span className={cn("flex items-center gap-1.5", status?.running ? "text-emerald-400" : "text-rose-400")}>
                <span className={cn("h-2 w-2 rounded-full", status?.running ? "bg-emerald-400" : "bg-rose-500")} />
                {status?.running ? `online · v${status.version}` : "offline"}
              </span>
            </Row>
            <Row label="Mode">{status?.managed ? "managed by ZAP Studio" : status?.external ? "attached (external)" : "—"}</Row>
            <Row label="API">
              <span className="font-mono text-2xs text-accent-400">{status?.apiUrl ?? "—"}</span>
            </Row>
            <Row label="Proxy">
              <span className="font-mono text-2xs">
                {status?.proxy ? `${status.proxy.address}:${status.proxy.port}` : "not configured"}
              </span>
            </Row>
            <Row label="Binary">
              <span className="font-mono text-2xs text-slate-400">{status?.zapPath ?? "auto-detect"}</span>
            </Row>
          </div>

          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle</h3>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => act("start", api.system.startZap, "ZAP started")}
            >
              {busy === "start" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Start ZAP
            </button>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => act("stop", api.system.stopZap, "ZAP stopped")}
            >
              <Power size={12} /> Stop ZAP
            </button>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => act("proxy", api.system.ensureProxy, "Proxy server ensured")}
            >
              <RotateCcw size={12} /> Ensure proxy
            </button>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => act("session", () => api.system.newSession("", true), "New session started")}
            >
              <RotateCcw size={12} /> New session
            </button>
          </div>

          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Session</h3>
          <div className="mb-4 flex gap-2">
            <input
              className="input flex-1"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="session name"
            />
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => act("save", () => api.system.saveSession(sessionName), "Session saved")}
            >
              <Save size={12} /> Save
            </button>
          </div>

          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Proxy setup</h3>
          <div className="panel space-y-1.5 p-3 text-2xs text-slate-400">
            <p>
              Point your browser or CLI at{" "}
              <code className="rounded bg-ink-800 px-1 font-mono text-accent-400">
                {status?.proxy ? `${status.proxy.address}:${status.proxy.port}` : "localhost:8080"}
              </code>
            </p>
            <p>
              CLI example:{" "}
              <code className="rounded bg-ink-800 px-1 font-mono text-slate-300">
                curl -x {status?.proxy ? `${status.proxy.address}:${status.proxy.port}` : "localhost:8080"} https://target
              </code>
            </p>
            <p className="text-slate-500">
              ZAP Studio attaches to a running daemon automatically; start one here if none is found.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800/60 py-1.5 last:border-0">
      <span className="text-2xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-slate-300">{children}</span>
    </div>
  );
}
