import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { DataTable, type Column } from "../../components/DataTable";
import { HttpMessageViewer } from "../../components/HttpMessageViewer";
import { Panel } from "../../components/Panel";
import { SplitPane } from "../../components/SplitPane";
import { cn, formatTime, methodColor, statusColor } from "../../lib/format";
import { useApp } from "../../store/app";
import { Eraser, Pause, Play, RefreshCw, Send, StepForward, Trash2 } from "lucide-react";
import type { FullMessage, HistoryItem } from "../../types";

type Scope = "all" | "in-scope";

export function ProxyView() {
  const toast = useApp((s) => s.toast);
  const intercepting = useApp((s) => s.intercepting);
  const setIntercepting = useApp((s) => s.setIntercepting);
  const historyCount = useApp((s) => s.historyCount);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [detail, setDetail] = useState<FullMessage | null>(null);
  const [held, setHeld] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await api.proxy.history({ count: 400 }));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load history");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load, historyCount]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    api.proxy
      .message(selected.id)
      .then(setDetail)
      .catch((e) => toast("error", e instanceof Error ? e.message : "Failed to load message"));
  }, [selected, toast]);

  useEffect(() => {
    if (!intercepting) return;
    const poll = async () => {
      try {
        const bp = await api.proxy.breakpoint();
        setHeld(bp.active ? bp.message : "");
      } catch {
        /* ignore */
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [intercepting]);

  const filtered = useMemo(() => {
    const needle = filter.toLowerCase();
    return items.filter((item) => {
      if (!needle) return true;
      return (
        item.url.toLowerCase().includes(needle) ||
        item.method.toLowerCase().includes(needle) ||
        String(item.status).includes(needle)
      );
    });
  }, [items, filter]);

  const columns: Column<HistoryItem>[] = [
    { key: "id", header: "#", width: "60px", render: (r) => <span className="text-slate-500">{r.id}</span> },
    {
      key: "method",
      header: "Method",
      width: "72px",
      render: (r) => <span className={cn("font-semibold", methodColor(r.method))}>{r.method}</span>,
    },
    {
      key: "url",
      header: "URL",
      render: (r) => <span className="font-mono text-2xs text-slate-300">{r.url}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "64px",
      render: (r) => <span className={cn("font-mono", statusColor(r.status))}>{r.status || "—"}</span>,
    },
    {
      key: "length",
      header: "Len",
      width: "70px",
      render: (r) => <span className="text-slate-500">{r.length}</span>,
    },
    {
      key: "mime",
      header: "Type",
      width: "110px",
      render: (r) => <span className="text-2xs text-slate-500">{r.mimeType || "—"}</span>,
    },
    {
      key: "time",
      header: "Time",
      width: "90px",
      render: (r) => <span className="text-2xs text-slate-600">{formatTime(r.timestamp)}</span>,
    },
  ];

  const forwardHeld = async (action: "continue" | "step" | "drop") => {
    try {
      await api.proxy.continueIntercept(action, held || undefined);
      if (action !== "drop") toast("success", `Request ${action === "step" ? "stepped" : "forwarded"}`);
      else toast("info", "Request dropped");
      setHeld("");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to continue");
    }
  };

  const toggleIntercept = async () => {
    try {
      await api.proxy.setIntercept(!intercepting);
      setIntercepting(!intercepting);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to toggle intercept");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar gap-2">
        <button
          className={cn("btn", intercepting && "bg-brand-500/25 text-brand-400")}
          onClick={toggleIntercept}
        >
          {intercepting ? <Pause size={12} /> : <Play size={12} />}
          {intercepting ? "Intercept on" : "Intercept off"}
        </button>
        <button className="btn" onClick={load}>
          <RefreshCw size={12} /> Refresh
        </button>
        <button className="btn" onClick={() => setAutoRefresh((v) => !v)}>
          {autoRefresh ? "Auto ✓" : "Auto ✗"}
        </button>
        <input
          className="input w-64"
          placeholder="Filter by URL, method or status…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="input"
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
        >
          <option value="all">All requests</option>
          <option value="in-scope">In-scope only</option>
        </select>
        <span className="ml-auto text-2xs text-slate-500">
          {filtered.length} / {items.length} shown
        </span>
        <button
          className="btn-danger"
          onClick={async () => {
            await api.proxy.clear();
            setItems([]);
            setDetail(null);
            toast("success", "History cleared");
          }}
        >
          <Eraser size={12} /> Clear
        </button>
      </div>

      <SplitPane
        direction="vertical"
        initial={52}
        first={
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            selectedKey={selected?.id}
            onSelect={setSelected}
            empty="No traffic captured yet. Configure your browser to use the proxy above."
          />
        }
        second={
          <div className="flex h-full flex-col">
            {held && intercepting && (
              <div className="border-b border-brand-500/40 bg-brand-500/10">
                <div className="toolbar justify-between border-b border-ink-700/70">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-400">
                    <Pause size={12} /> Held request — edit then forward
                  </span>
                  <div className="flex gap-1.5">
                    <button className="btn-primary" onClick={() => forwardHeld("continue")}>
                      <Send size={12} /> Forward
                    </button>
                    <button className="btn" onClick={() => forwardHeld("step")}>
                      <StepForward size={12} /> Step
                    </button>
                    <button className="btn-danger" onClick={() => forwardHeld("drop")}>
                      <Trash2 size={12} /> Drop
                    </button>
                  </div>
                </div>
                <textarea
                  value={held}
                  onChange={(e) => setHeld(e.target.value)}
                  spellCheck={false}
                  className="h-40 w-full resize-none bg-ink-900 p-2 font-mono text-2xs text-slate-200 focus:outline-none"
                />
              </div>
            )}

            {detail ? (
              <SplitPane
                direction="vertical"
                initial={50}
                first={
                  <HttpMessageViewer
                    title="Request"
                    raw={detail.requestRaw}
                    headers={detail.request.headers}
                    body={detail.request.body}
                  />
                }
                second={
                  <HttpMessageViewer
                    title="Response"
                    raw={detail.responseRaw}
                    headers={detail.response.headers}
                    body={detail.response.body}
                    status={detail.response.status}
                    statusLine={detail.response.statusLine}
                  />
                }
              />
            ) : (
              <Panel title="Message viewer">
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Select a request to inspect its raw request and response.
                </div>
              </Panel>
            )}
          </div>
        }
      />
    </div>
  );
}
