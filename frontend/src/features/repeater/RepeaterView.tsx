import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { HttpMessageViewer } from "../../components/HttpMessageViewer";

import { SplitPane } from "../../components/SplitPane";
import { cn, statusColor } from "../../lib/format";
import { useApp } from "../../store/app";
import { Download, History, Send, Trash2 } from "lucide-react";
import type { HistoryItem } from "../../types";

interface RepeaterTab {
  id: string;
  name: string;
  raw: string;
  responseRaw: string;
  status: number;
  statusLine: string;
  rtt: number;
}

const TEMPLATE = `GET http://example.com/ HTTP/1.1
Host: example.com
User-Agent: ZAP-Studio/1.0
Accept: */*

`;

export function RepeaterView() {
  const toast = useApp((s) => s.toast);
  const [tabs, setTabs] = useState<RepeaterTab[]>([
    { id: "1", name: "Repeater 1", raw: TEMPLATE, responseRaw: "", status: 0, statusLine: "", rtt: 0 },
  ]);
  const [activeId, setActiveId] = useState("1");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sending, setSending] = useState(false);

  const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? tabs[0], [tabs, activeId]);

  useEffect(() => {
    api.proxy
      .history({ count: 60 })
      .then((items) => setHistory(items.slice().reverse()))
      .catch(() => undefined);
  }, []);

  const update = (patch: Partial<RepeaterTab>) =>
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)));

  const send = async () => {
    if (!active.raw.trim()) {
      toast("error", "Nothing to send — paste a raw HTTP request.");
      return;
    }
    setSending(true);
    try {
      const result = await api.repeater.send({ raw: active.raw, followRedirects: false });
      update({
        responseRaw: result.responseRaw,
        status: result.response.status,
        statusLine: result.response.statusLine,
        rtt: result.rtt,
      });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setSending(false);
    }
  };

  const addTab = () => {
    const id = String(Date.now());
    setTabs((prev) => [
      ...prev,
      { id, name: `Repeater ${prev.length + 1}`, raw: TEMPLATE, responseRaw: "", status: 0, statusLine: "", rtt: 0 },
    ]);
    setActiveId(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length && id === activeId) setActiveId(next[next.length - 1].id);
      return next.length ? next : prev;
    });
  };

  const loadFromHistory = (item: HistoryItem) => {
    api.proxy
      .message(item.id)
      .then((msg) => {
        update({ raw: msg.requestRaw, responseRaw: msg.responseRaw, status: msg.response.status, statusLine: msg.response.statusLine });
        toast("success", `Loaded request #${item.id} into Repeater`);
      })
      .catch((e) => toast("error", e instanceof Error ? e.message : "Failed to load message"));
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-ink-700/70 bg-ink-850">
        <div className="toolbar justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <History size={13} /> From history
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          {history.length === 0 && (
            <div className="p-3 text-center text-2xs text-slate-600">No proxy history yet.</div>
          )}
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => loadFromHistory(item)}
              className="block w-full border-b border-ink-800/50 px-2 py-1.5 text-left hover:bg-ink-800/60"
            >
              <div className="flex items-center gap-2 text-2xs">
                <span className={cn("font-semibold", statusColor(item.status))}>{item.method}</span>
                <span className="text-slate-500">{item.status}</span>
              </div>
              <div className="truncate font-mono text-2xs text-slate-500">{item.url}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-ink-700/70 bg-ink-900 px-2">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                t.id === activeId ? "text-brand-400 border-b-2 border-brand-500" : "text-slate-400 hover:text-slate-200",
              )}
            >
              <button onClick={() => setActiveId(t.id)}>{t.name}</button>
              <button
                className="text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
                onClick={() => closeTab(t.id)}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          <button className="btn ml-1" onClick={addTab}>
            + New
          </button>
        </div>

        <div className="toolbar gap-2">
          <button className="btn-primary" onClick={send} disabled={sending}>
            <Send size={12} /> {sending ? "Sending…" : "Send"}
          </button>
          <span className={cn("font-mono text-2xs", statusColor(active.status))}>
            {active.statusLine || "no response yet"}
          </span>
          {active.rtt > 0 && <span className="text-2xs text-slate-500">{active.rtt} ms</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn"
              onClick={() => {
                update({ raw: TEMPLATE });
                toast("info", "Request reset to template");
              }}
            >
              Reset
            </button>
            <button
              className="btn"
              onClick={() => {
                const blob = new Blob([active.responseRaw], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `repeater-response-${active.id}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={!active.responseRaw}
            >
              <Download size={12} /> Save response
            </button>
          </div>
        </div>

        <SplitPane
          direction="vertical"
          initial={50}
          first={
            <HttpMessageViewer
              title="Request"
              raw={active.raw}
              editable
              onChange={(raw) => update({ raw })}
            />
          }
          second={
            <HttpMessageViewer
              title="Response"
              raw={active.responseRaw || "Send the request to see the response here."}
              status={active.status}
              statusLine={active.statusLine}
            />
          }
        />
      </div>
    </div>
  );
}
