import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import { HttpMessageViewer } from "../../components/HttpMessageViewer";
import { SplitPane } from "../../components/SplitPane";
import { cn, formatBytes, statusColor } from "../../lib/format";
import { useApp } from "../../store/app";
import { Braces, Loader2, Play, Plus, Send, Square, Upload, X } from "lucide-react";
import type { IntruderResult } from "../../types";

type AttackType = "sniper" | "batteringram" | "pitchfork" | "clusterbomb";

const TEMPLATE = `POST http://example.com/login HTTP/1.1
Host: example.com
Content-Type: application/x-www-form-urlencoded
Content-Length: 29

username=§admin§&password=§pass§
`;

const ATTACKS: { id: AttackType; label: string; blurb: string }[] = [
  { id: "sniper", label: "Sniper", blurb: "One payload set, one position at a time" },
  { id: "batteringram", label: "Battering ram", blurb: "Same payload into every position" },
  { id: "pitchfork", label: "Pitchfork", blurb: "Multiple sets, advanced in lock-step" },
  { id: "clusterbomb", label: "Cluster bomb", blurb: "Every combination of every set" },
];

export function IntruderView() {
  const toast = useApp((s) => s.toast);
  const [request, setRequest] = useState(TEMPLATE);
  const [attackType, setAttackType] = useState<AttackType>("sniper");
  const [payloadText, setPayloadText] = useState("admin\nroot\ntest\nadministrator\nuser");
  const [threads, setThreads] = useState(10);
  const [results, setResults] = useState<IntruderResult[]>([]);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<IntruderResult | null>(null);
  const [filter, setFilter] = useState("");
  const runIdRef = useRef<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const placeholders = useMemo(() => (request.match(/§[^§]*§/g) ?? []).length, [request]);

  const payloadSets = useMemo(() => {
    const sets = payloadText
      .split(/\n-{3,}\n/) // "---" separates sets for pitchfork/clusterbomb
      .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean));
    return sets.length ? sets : [[]];
  }, [payloadText]);

  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  const preview = async () => {
    try {
      const res = await api.intruder.preview({
        request,
        attackType,
        payloadSets,
        threads,
      });
      toast("info", `This attack will issue ${res.total} requests`);
      setTotal(res.total);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Preview failed");
    }
  };

  const start = async () => {
    if (placeholders === 0) {
      toast("error", "Add at least one §payload§ marker to the request.");
      return;
    }
    setResults([]);
    setSelected(null);
    setRunning(true);
    try {
      const { runId, total: count } = await api.intruder.createRun({
        request,
        attackType,
        payloadSets,
        threads,
      });
      runIdRef.current = runId;
      setTotal(count);
      const source = new EventSource(api.intruder.streamUrl(runId));
      sourceRef.current = source;
      source.onmessage = (event) => {
        const result = JSON.parse(event.data) as IntruderResult;
        setResults((prev) => [...prev, result]);
      };
      source.addEventListener("done", () => {
        source.close();
        setRunning(false);
        toast("success", `Attack finished — ${count} requests sent`);
      });
      source.onerror = () => {
        source.close();
        setRunning(false);
      };
    } catch (e) {
      setRunning(false);
      toast("error", e instanceof Error ? e.message : "Failed to start attack");
    }
  };

  const stop = async () => {
    if (runIdRef.current) {
      try {
        await api.intruder.cancel(runIdRef.current);
      } catch {
        /* best effort */
      }
    }
    sourceRef.current?.close();
    setRunning(false);
    toast("info", "Attack cancelled");
  };

  const filtered = useMemo(() => {
    const needle = filter.toLowerCase();
    if (!needle) return results;
    return results.filter(
      (r) =>
        String(r.status).includes(needle) ||
        String(r.length).includes(needle) ||
        r.payloads.join(" ").toLowerCase().includes(needle),
    );
  }, [results, filter]);

  const statusSet = useMemo(() => new Set(results.map((r) => r.status)), [results]);
  const lengthSet = useMemo(() => new Set(results.map((r) => r.length)), [results]);
  const interesting = (r: IntruderResult) =>
    results.length > 1 && (statusSet.size > 1 || lengthSet.size > 1) && r.status >= 300;

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar gap-2">
        <Braces size={13} className="text-brand-500" />
        <select
          className="input"
          value={attackType}
          onChange={(e) => setAttackType(e.target.value as AttackType)}
        >
          {ATTACKS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="text-2xs text-slate-500">{ATTACKS.find((a) => a.id === attackType)?.blurb}</span>
        <label className="ml-2 flex items-center gap-1.5 text-2xs text-slate-400">
          Threads
          <input
            type="number"
            min={1}
            max={50}
            value={threads}
            onChange={(e) => setThreads(Number(e.target.value))}
            className="input w-16"
          />
        </label>
        <span className="chip bg-ink-700 text-slate-400">{placeholders} markers</span>
        {running ? (
          <button className="btn-danger" onClick={stop}>
            <Square size={12} /> Stop
          </button>
        ) : (
          <>
            <button className="btn" onClick={preview}>
              Preview
            </button>
            <button className="btn-primary" onClick={start}>
              <Play size={12} /> Start attack
            </button>
          </>
        )}
        {running && (
          <span className="flex items-center gap-1.5 text-2xs text-brand-400">
            <Loader2 size={12} className="animate-spin" />
            {results.length} / {total}
          </span>
        )}
      </div>

      <SplitPane
        direction="vertical"
        initial={40}
        first={
          <div className="flex h-full">
            <div className="flex min-w-0 flex-1 flex-col border-r border-ink-700/70">
              <HttpMessageViewer
                title="Request template — wrap payload positions in §markers§"
                raw={request}
                editable
                onChange={setRequest}
              />
            </div>
            <div className="flex w-72 shrink-0 flex-col bg-ink-850">
              <div className="toolbar">
                <span className="text-xs font-semibold text-slate-200">Payloads</span>
                <span className="ml-auto text-2xs text-slate-500">one per line · sets split by ---</span>
              </div>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                spellCheck={false}
                className="flex-1 resize-none bg-ink-900 p-2 font-mono text-2xs text-slate-200 focus:outline-none"
              />
              <div className="flex items-center gap-2 border-t border-ink-700 p-2 text-2xs text-slate-500">
                <Upload size={11} />
                <label className="cursor-pointer hover:text-slate-300">
                  Load wordlist
                  <input
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setPayloadText(await file.text());
                    }}
                  />
                </label>
                <span className="ml-auto">
                  {payloadSets.reduce((n, s) => n + s.length, 0)} payloads / {payloadSets.length} sets
                </span>
              </div>
            </div>
          </div>
        }
        second={
          <div className="flex h-full">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="toolbar gap-2">
                <span className="text-xs font-semibold text-slate-200">Results</span>
                <input
                  className="input w-40"
                  placeholder="Filter…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <span className="text-2xs text-slate-500">{filtered.length} rows</span>
                <button className="btn ml-auto" onClick={() => setResults([])} disabled={running}>
                  <X size={12} /> Clear
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-2xs">
                  <thead className="sticky top-0 bg-ink-800">
                    <tr>
                      <th className="px-2 py-1 text-left text-slate-400">#</th>
                      <th className="px-2 py-1 text-left text-slate-400">Payload</th>
                      <th className="px-2 py-1 text-left text-slate-400">Status</th>
                      <th className="px-2 py-1 text-left text-slate-400">Length</th>
                      <th className="px-2 py-1 text-left text-slate-400">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-600">
                          {running ? "Attack in progress…" : "No results yet — start an attack."}
                        </td>
                      </tr>
                    )}
                    {filtered.map((r) => (
                      <tr
                        key={`${r.index}-${r.payloads.join("|")}`}
                        onClick={() => setSelected(r)}
                        className={cn(
                          "cursor-pointer border-b border-ink-800/60 hover:bg-ink-800/60",
                          selected?.index === r.index && "bg-brand-500/15",
                          interesting(r) && "bg-amber-500/5",
                        )}
                      >
                        <td className="px-2 py-1 text-slate-500">{r.index}</td>
                        <td className="px-2 py-1 font-mono text-slate-300">{r.payloads.join(", ")}</td>
                        <td className={cn("px-2 py-1 font-mono", statusColor(r.status))}>{r.status || "err"}</td>
                        <td className="px-2 py-1 text-slate-400">{formatBytes(r.length)}</td>
                        <td className="px-2 py-1 text-slate-500">{r.rtt} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="w-1/2 border-l border-ink-700/70">
              {selected ? (
                <SplitPane
                  direction="vertical"
                  initial={50}
                  first={<HttpMessageViewer title="Request" raw={selected.requestHeader} />}
                  second={
                    <HttpMessageViewer
                      title="Response"
                      raw={selected.responseHeader + "\n" + selected.responseBody}
                      status={selected.status}
                    />
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Select a result row to inspect the exchange.
                </div>
              )}
            </div>
          </div>
        }
      />

      <div className="flex items-center gap-3 border-t border-ink-700/70 bg-ink-900 px-3 py-1 text-2xs text-slate-500">
        <span className="flex items-center gap-1">
          <Plus size={11} /> {total} total requests planned
        </span>
        <span className="flex items-center gap-1">
          <Send size={11} /> {results.length} sent
        </span>
        <span className="ml-auto">
          Highlighted rows differ in status code or response length — likely worth triage.
        </span>
      </div>
    </div>
  );
}
