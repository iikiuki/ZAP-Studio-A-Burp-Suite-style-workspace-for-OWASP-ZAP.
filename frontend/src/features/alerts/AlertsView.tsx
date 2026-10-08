import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { DataTable, type Column } from "../../components/DataTable";
import { Panel } from "../../components/Panel";
import { SplitPane } from "../../components/SplitPane";
import { cn, normalizeRisk, riskClass, riskRank, shortUrl } from "../../lib/format";
import { useApp } from "../../store/app";
import { ExternalLink, Filter, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import type { Alert } from "../../types";

export function AlertsView() {
  const toast = useApp((s) => s.toast);
  const alerts = useApp((s) => s.alerts);
  const setAlerts = useApp((s) => s.setAlerts);
  const alertCount = useApp((s) => s.alertCount);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      setAlerts(await api.alerts.list({ count: 1000 }));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load alerts");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertCount]);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return alerts
      .filter((a) => (riskFilter === "all" ? true : normalizeRisk(a.risk) === riskFilter))
      .filter((a) =>
        needle
          ? a.name.toLowerCase().includes(needle) || a.url.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => riskRank(a.risk) - riskRank(b.risk));
  }, [alerts, riskFilter, search]);

  const counts = useMemo(() => {
    const map = { High: 0, Medium: 0, Low: 0, Informational: 0 } as Record<string, number>;
    alerts.forEach((a) => (map[normalizeRisk(a.risk)] += 1));
    return map;
  }, [alerts]);

  const columns: Column<Alert>[] = [
    {
      key: "risk",
      header: "Risk",
      width: "110px",
      render: (r) => <span className={cn(riskClass(r.risk), "justify-center")}>{normalizeRisk(r.risk)}</span>,
    },
    { key: "name", header: "Issue", render: (r) => <span className="text-slate-200">{r.name}</span> },
    {
      key: "confidence",
      header: "Confidence",
      width: "100px",
      render: (r) => <span className="text-2xs text-slate-500">{r.confidence}</span>,
    },
    {
      key: "url",
      header: "URL",
      render: (r) => <span className="font-mono text-2xs text-slate-400">{shortUrl(r.url, 80)}</span>,
    },
    {
      key: "param",
      header: "Param",
      width: "120px",
      render: (r) => <span className="font-mono text-2xs text-accent-400">{r.param || "—"}</span>,
    },
    {
      key: "cwe",
      header: "CWE",
      width: "70px",
      render: (r) => <span className="text-2xs text-slate-500">{r.cweId || "—"}</span>,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar gap-2">
        <ShieldAlert size={13} className="text-brand-500" />
        <select className="input" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="all">All risks ({alerts.length})</option>
          <option value="High">High ({counts.High})</option>
          <option value="Medium">Medium ({counts.Medium})</option>
          <option value="Low">Low ({counts.Low})</option>
          <option value="Informational">Informational ({counts.Informational})</option>
        </select>
        <input
          className="input w-64"
          placeholder="Search issue name or URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" onClick={load}>
          <RefreshCw size={12} /> Refresh
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-2xs text-slate-500">
          <Filter size={11} /> {filtered.length} shown
        </span>
        <button
          className="btn-danger"
          onClick={async () => {
            await api.alerts.clear();
            setAlerts([]);
            setSelected(null);
            toast("success", "All issues cleared");
          }}
        >
          <Trash2 size={12} /> Clear all
        </button>
      </div>

      <SplitPane
        direction="vertical"
        initial={55}
        first={
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            selectedKey={selected?.id}
            onSelect={setSelected}
            empty="No issues yet. Run a scan to populate findings."
          />
        }
        second={
          selected ? (
            <div className="h-full overflow-auto p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className={riskClass(selected.risk)}>{normalizeRisk(selected.risk)}</span>
                <h2 className="text-sm font-semibold text-slate-100">{selected.name}</h2>
                <span className="chip bg-ink-700 text-slate-400">confidence: {selected.confidence}</span>
                {selected.url && (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn ml-auto"
                  >
                    <ExternalLink size={11} /> Open URL
                  </a>
                )}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-2xs">
                <Field label="URL" value={selected.url} mono />
                <Field label="Parameter" value={selected.param || "—"} mono />
                <Field label="Attack" value={selected.attack || "—"} mono />
                <Field label="Evidence" value={selected.evidence || "—"} mono />
                <Field label="CWE" value={selected.cweId || "—"} />
                <Field label="WASC" value={selected.wascId || "—"} />
                <Field label="Plugin" value={selected.pluginId || "—"} />
                <Field label="Alert ref" value={selected.alertRef || "—"} />
              </div>

              <Section title="Description" text={selected.description} />
              <Section title="Solution" text={selected.solution} />
              <Section title="References" text={selected.reference} />
            </div>
          ) : (
            <Panel title="Issue detail">
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Select an issue to read its description, evidence and remediation.
              </div>
            </Panel>
          )
        }
      />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="text-2xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("truncate text-slate-300", mono && "font-mono")} title={value}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <pre className="whitespace-pre-wrap break-words rounded bg-ink-900 p-2 text-2xs text-slate-300">
        {text}
      </pre>
    </div>
  );
}
