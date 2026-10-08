import { useEffect } from "react";
import { api } from "../../api/client";
import { StatCard } from "../../components/Panel";
import { useApp } from "../../store/app";
import { cn, normalizeRisk, riskClass, riskRank, shortUrl } from "../../lib/format";
import { Activity, Crosshair, Globe, Play, ShieldAlert, Square } from "lucide-react";
import type { Alert } from "../../types";

export function Dashboard() {
  const status = useApp((s) => s.status);
  const historyCount = useApp((s) => s.historyCount);
  const alertCount = useApp((s) => s.alertCount);
  const alerts = useApp((s) => s.alerts);
  const setAlerts = useApp((s) => s.setAlerts);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const toast = useApp((s) => s.toast);

  useEffect(() => {
    const load = async () => {
      try {
        setAlerts(await api.alerts.list({ count: 1000 }));
      } catch {
        /* dashboard stays usable offline */
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [setAlerts]);

  const byRisk = (risk: string) => alerts.filter((a) => normalizeRisk(a.risk) === risk).length;
  const uniqueTypes = new Set(alerts.map((a) => a.name)).size;
  const hosts = new Set(alerts.map((a) => a.url.split("/")[2]).filter(Boolean)).size;

  const topAlerts = [...alerts].sort((a, b) => riskRank(a.risk) - riskRank(b.risk)).slice(0, 8);

  const quickScan = async () => {
    if (!status?.running) {
      toast("error", "ZAP is not running. Start it from Settings.");
      return;
    }
    try {
      const { sites } = await api.target.sites();
      const target = sites[0];
      if (!target) {
        toast("error", "No targets in the site map yet. Browse through the proxy first.");
        return;
      }
      await api.scans.startSpider({ url: target, recurse: true });
      await api.scans.startActive({ url: target, recurse: true });
      toast("success", `Spider + active scan started for ${shortUrl(target, 40)}`);
      setActiveTab("scanner");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Scan failed to start");
    }
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Engagement overview</h1>
          <p className="text-xs text-slate-500">
            {status?.running
              ? `Connected to ZAP ${status.version} · proxy ${status.proxy?.address}:${status.proxy?.port}`
              : "ZAP is offline — start the daemon to begin testing."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={quickScan}>
            <Play size={12} /> Quick scan first target
          </button>
          <button className="btn" onClick={() => setActiveTab("proxy")}>
            <Square size={12} /> Open proxy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="High" value={byRisk("High")} accent="text-rose-400" />
        <StatCard label="Medium" value={byRisk("Medium")} accent="text-amber-400" />
        <StatCard label="Low" value={byRisk("Low")} accent="text-sky-400" />
        <StatCard label="Info" value={byRisk("Informational")} accent="text-slate-400" />
        <StatCard label="Requests" value={historyCount} accent="text-emerald-400" hint="proxy history" />
        <StatCard label="Issue types" value={uniqueTypes} accent="text-accent-400" hint={`${hosts} hosts`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="panel col-span-2 flex flex-col">
          <div className="toolbar justify-between">
            <span className="text-xs font-semibold text-slate-200">Top findings</span>
            <button className="btn" onClick={() => setActiveTab("alerts")}>
              <ShieldAlert size={12} /> View all {alertCount}
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            {topAlerts.length === 0 && (
              <div className="px-3 py-10 text-center text-xs text-slate-500">
                No issues recorded yet. Run a scan to populate findings.
              </div>
            )}
            {topAlerts.map((a: Alert) => (
              <div
                key={a.id}
                className="flex items-center gap-3 border-b border-ink-800/60 px-3 py-2 hover:bg-ink-800/40"
              >
                <span className={cn(riskClass(a.risk), "w-24 justify-center")}>
                  {normalizeRisk(a.risk)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-slate-200">{a.name}</div>
                  <div className="truncate text-2xs text-slate-500">{shortUrl(a.url, 70)}</div>
                </div>
                <span className="chip bg-ink-700 text-slate-400">{a.confidence}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel flex flex-col">
          <div className="toolbar">
            <span className="text-xs font-semibold text-slate-200">Getting started</span>
          </div>
          <ol className="space-y-2 p-3 text-xs text-slate-400">
            <li className="flex gap-2">
              <Globe size={13} className="mt-0.5 shrink-0 text-brand-500" />
              <span>
                Point your browser at the proxy{" "}
                <code className="rounded bg-ink-800 px-1 font-mono text-2xs text-accent-400">
                  {status?.proxy ? `${status.proxy.address}:${status.proxy.port}` : "localhost:8080"}
                </code>
              </span>
            </li>
            <li className="flex gap-2">
              <Crosshair size={13} className="mt-0.5 shrink-0 text-brand-500" />
              <span>Browse the target, then run Spider to map endpoints.</span>
            </li>
            <li className="flex gap-2">
              <Activity size={13} className="mt-0.5 shrink-0 text-brand-500" />
              <span>Launch an Active Scan and triage the Issues tab.</span>
            </li>
            <li className="flex gap-2">
              <ShieldAlert size={13} className="mt-0.5 shrink-0 text-brand-500" />
              <span>Export a report from the Reports tab when finished.</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
