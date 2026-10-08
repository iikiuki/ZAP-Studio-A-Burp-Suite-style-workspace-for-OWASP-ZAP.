import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { DataTable, type Column } from "../../components/DataTable";
import { Panel } from "../../components/Panel";
import { cn, shortUrl } from "../../lib/format";
import { useApp } from "../../store/app";
import { Activity, Loader2, Pause, Play, RefreshCw, Square } from "lucide-react";
import type { Scan, Scanner } from "../../types";

export function ScannerView() {
  const toast = useApp((s) => s.toast);
  const [tab, setTab] = useState<"active" | "passive" | "rules">("active");
  const [target, setTarget] = useState("");
  const [scans, setScans] = useState<Scan[]>([]);
  const [records, setRecords] = useState(0);
  const [activeRules, setActiveRules] = useState<Scanner[]>([]);
  const [passiveRules, setPassiveRules] = useState<Scanner[]>([]);

  const load = async () => {
    try {
      const { scans: found } = await api.scans.ascan();
      setScans(found);
      const { recordsToScan } = await api.scans.passiveRecords();
      setRecords(recordsToScan);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load scan state");
    }
  };

  const loadRules = async () => {
    try {
      const [a, p] = await Promise.all([api.scans.activeScanners(), api.scans.passiveScanners()]);
      setActiveRules(a.scanners ?? []);
      setPassiveRules(p.scanners ?? []);
    } catch {
      /* rules may not be exposed in all ZAP builds */
    }
  };

  useEffect(() => {
    load();
    loadRules();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!target) {
      toast("error", "Enter a URL to scan");
      return;
    }
    try {
      const { scanId } = await api.scans.startActive({ url: target, recurse: true });
      toast("success", `Active scan #${scanId} started`);
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to start active scan");
    }
  };

  const scanColumns: Column<Scan>[] = [
    { key: "id", header: "ID", width: "70px", render: (r) => <span className="text-slate-500">{r.id}</span> },
    {
      key: "state",
      header: "State",
      width: "110px",
      render: (r) => (
        <span
          className={cn(
            "chip",
            r.state === "RUNNING" ? "bg-brand-500/20 text-brand-400" : "bg-ink-700 text-slate-400",
          )}
        >
          {r.state === "RUNNING" && <Loader2 size={10} className="animate-spin" />}
          {r.state ?? "—"}
        </span>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      width: "180px",
      render: (r) => {
        const value = Number(r.progress ?? 0);
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded bg-ink-700">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, value)}%` }} />
            </div>
            <span className="text-2xs text-slate-500">{value}%</span>
          </div>
        );
      },
    },
    {
      key: "url",
      header: "URL",
      render: (r) => <span className="font-mono text-2xs text-slate-400">{shortUrl(String(r.url ?? ""), 70)}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "160px",
      render: (r) => (
        <div className="flex gap-1">
          <button
            className="btn"
            onClick={async (e) => {
              e.stopPropagation();
              await api.scans.pauseActive(String(r.id));
              toast("info", `Scan #${r.id} paused`);
            }}
          >
            <Pause size={11} />
          </button>
          <button
            className="btn"
            onClick={async (e) => {
              e.stopPropagation();
              await api.scans.resumeActive(String(r.id));
              toast("info", `Scan #${r.id} resumed`);
            }}
          >
            <Play size={11} />
          </button>
          <button
            className="btn-danger"
            onClick={async (e) => {
              e.stopPropagation();
              await api.scans.stopActive(String(r.id));
              toast("info", `Scan #${r.id} stopped`);
            }}
          >
            <Square size={11} />
          </button>
        </div>
      ),
    },
  ];

  const ruleColumns: Column<Scanner>[] = [
    { key: "id", header: "ID", width: "60px", render: (r) => <span className="text-slate-500">{r.id}</span> },
    { key: "name", header: "Rule", render: (r) => <span className="text-slate-300">{r.name}</span> },
    {
      key: "enabled",
      header: "Enabled",
      width: "90px",
      render: (r) => (
        <span className={cn("chip", r.enabled === "true" ? "bg-emerald-500/15 text-emerald-400" : "bg-ink-700 text-slate-500")}>
          {r.enabled === "true" ? "on" : "off"}
        </span>
      ),
    },
    { key: "quality", header: "Quality", width: "90px", render: (r) => <span className="text-2xs text-slate-500">{r.quality}</span> },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar gap-2">
        <Activity size={13} className="text-brand-500" />
        <input
          className="input w-96"
          placeholder="http://target.local/"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
        />
        <button className="btn-primary" onClick={start}>
          <Play size={12} /> Active scan
        </button>
        <button
          className="btn"
          onClick={async () => {
            const { sites } = await api.target.sites();
            if (sites[0]) setTarget(sites[0]);
          }}
        >
          Use first site
        </button>
        <button className="btn" onClick={load}>
          <RefreshCw size={12} />
        </button>
        <div className="ml-auto flex items-center gap-3 text-2xs">
          <span className="text-slate-500">
            Passive queue: <span className="font-mono text-accent-400">{records}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-ink-700/70 bg-ink-900 px-2">
        {(["active", "passive", "rules"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs capitalize transition-colors",
              tab === t ? "text-brand-400 border-b-2 border-brand-500" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {t === "rules" ? "Scan rules" : `${t} scans`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "active" && (
          <DataTable
            columns={scanColumns}
            rows={scans}
            rowKey={(r) => String(r.id)}
            empty="No active scans running."
          />
        )}
        {tab === "passive" && (
          <div className="h-full overflow-auto p-4">
            <Panel title="Passive scanning" subtitle={`${records} records awaiting analysis`} className="max-w-2xl">
              <div className="space-y-2 p-3 text-xs text-slate-400">
                <p>
                  Passive scanning inspects traffic already in the site map. It runs automatically as
                  requests flow through the proxy.
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-64 overflow-hidden rounded bg-ink-700">
                    <div
                      className="h-full bg-accent-500 transition-all"
                      style={{ width: `${records === 0 ? 100 : 40}%` }}
                    />
                  </div>
                  <span className="font-mono text-2xs">{records === 0 ? "idle" : `${records} pending`}</span>
                </div>
              </div>
            </Panel>
          </div>
        )}
        {tab === "rules" && (
          <div className="grid h-full grid-cols-2 overflow-hidden">
            <Panel title="Active scan rules" subtitle={`${activeRules.length} rules`} className="border-r border-ink-700/70">
              <DataTable
                columns={ruleColumns}
                rows={activeRules}
                rowKey={(r) => r.id}
                empty="Scan rules unavailable."
              />
            </Panel>
            <Panel title="Passive scan rules" subtitle={`${passiveRules.length} rules`}>
              <DataTable
                columns={ruleColumns}
                rows={passiveRules}
                rowKey={(r) => r.id}
                empty="Passive rules unavailable."
              />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
