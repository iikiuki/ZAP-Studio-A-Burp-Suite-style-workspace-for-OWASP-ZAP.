import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { DataTable, type Column } from "../../components/DataTable";
import { Panel } from "../../components/Panel";
import { cn, shortUrl } from "../../lib/format";
import { useApp } from "../../store/app";
import { Crosshair, Loader2, Play, RefreshCw, Square } from "lucide-react";
import type { Scan } from "../../types";

export function SpiderView() {
  const toast = useApp((s) => s.toast);
  const [target, setTarget] = useState("");
  const [recurse, setRecurse] = useState(true);
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { scans: found } = await api.scans.spider();
      setScans(found);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load spider scans");
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.scans
      .spiderResults(selected.id)
      .then((r) => setResults(r.urls ?? []))
      .catch(() => setResults([]));
  }, [selected]);

  const start = async () => {
    if (!target) {
      toast("error", "Enter a URL to spider");
      return;
    }
    setBusy(true);
    try {
      const { scanId } = await api.scans.startSpider({ url: target, recurse });
      toast("success", `Spider #${scanId} started`);
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to start spider");
    } finally {
      setBusy(false);
    }
  };

  const useFirstSite = async () => {
    try {
      const { sites } = await api.target.sites();
      if (sites[0]) setTarget(sites[0]);
    } catch {
      /* ignore */
    }
  };

  const columns: Column<Scan>[] = [
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
    { key: "progress", header: "Progress", width: "100px", render: (r) => <span>{String(r.progress ?? "—")}</span> },
    { key: "url", header: "URL", render: (r) => <span className="font-mono text-2xs text-slate-400">{shortUrl(String(r.url ?? ""), 80)}</span> },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar gap-2">
        <Crosshair size={13} className="text-brand-500" />
        <input
          className="input w-96"
          placeholder="http://target.local/"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
        />
        <button className="btn" onClick={useFirstSite}>
          Use first site
        </button>
        <label className="flex items-center gap-1.5 text-2xs text-slate-400">
          <input type="checkbox" checked={recurse} onChange={(e) => setRecurse(e.target.checked)} />
          Recurse
        </label>
        <button className="btn-primary" onClick={start} disabled={busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Start spider
        </button>
        <button className="btn" onClick={load}>
          <RefreshCw size={12} />
        </button>
        <button
          className="btn-danger ml-auto"
          onClick={async () => {
            await api.scans.stopAllSpider();
            toast("info", "All spider scans stopped");
            load();
          }}
        >
          <Square size={12} /> Stop all
        </button>
      </div>

      <div className="grid flex-1 grid-cols-2 overflow-hidden">
        <DataTable
          columns={columns}
          rows={scans}
          rowKey={(r) => String(r.id)}
          selectedKey={selected ? String(selected.id) : undefined}
          onSelect={setSelected}
          empty="No spider scans yet."
        />
        <Panel
          title="Discovered URLs"
          subtitle={selected ? `scan #${selected.id}` : undefined}
          className="border-l border-ink-700/70"
        >
          <div className="h-full overflow-auto p-2 font-mono text-2xs text-slate-400">
            {results.length === 0 && (
              <div className="p-4 text-center text-slate-600">Select a scan to view its URL tree.</div>
            )}
            {results.map((url) => (
              <div key={url} className="truncate py-0.5 hover:text-slate-200">
                {url}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
