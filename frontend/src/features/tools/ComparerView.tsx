import { useState } from "react";
import { api } from "../../api/client";
import { cn } from "../../lib/format";
import { useApp } from "../../store/app";
import { GitCompare, Play } from "lucide-react";

interface Operation {
  tag: string;
  left: string;
  right: string;
}

export function ComparerView() {
  const toast = useApp((s) => s.toast);
  const [left, setLeft] = useState("HTTP/1.1 200 OK\nContent-Type: text/html\n\n<h1>Welcome</h1>");
  const [right, setRight] = useState("HTTP/1.1 403 Forbidden\nContent-Type: text/html\n\n<h1>Denied</h1>");
  const [mode, setMode] = useState("line");
  const [ops, setOps] = useState<Operation[]>([]);
  const [stats, setStats] = useState<{ added: number; removed: number; similarity: number } | null>(null);

  const run = async () => {
    try {
      const res = await api.tools.diff(left, right, mode);
      setOps(res.operations);
      setStats({ added: res.added, removed: res.removed, similarity: res.similarity });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Comparison failed");
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">Comparer</span>
        <span className="text-2xs text-slate-500">
          Diff two messages word-by-word or byte-by-byte to spot behavioural differences.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="line">Lines</option>
            <option value="word">Words</option>
            <option value="char">Characters</option>
          </select>
          <button className="btn-primary" onClick={run}>
            <Play size={12} /> Compare
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel flex flex-col">
          <div className="toolbar">
            <span className="text-xs font-semibold text-slate-200">Item 1</span>
          </div>
          <textarea
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            spellCheck={false}
            className="h-40 resize-none bg-ink-900 p-2 font-mono text-2xs text-slate-200 focus:outline-none"
          />
        </div>
        <div className="panel flex flex-col">
          <div className="toolbar">
            <span className="text-xs font-semibold text-slate-200">Item 2</span>
          </div>
          <textarea
            value={right}
            onChange={(e) => setRight(e.target.value)}
            spellCheck={false}
            className="h-40 resize-none bg-ink-900 p-2 font-mono text-2xs text-slate-200 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 panel flex flex-1 flex-col overflow-hidden">
        <div className="toolbar justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <GitCompare size={13} /> Differences
          </span>
          {stats && (
            <span className="flex items-center gap-3 text-2xs">
              <span className="text-emerald-400">+{stats.added} added</span>
              <span className="text-rose-400">-{stats.removed} removed</span>
              <span className="text-slate-500">similarity {(stats.similarity * 100).toFixed(1)}%</span>
            </span>
          )}
        </div>
        <div className="flex-1 overflow-auto p-2">
          {ops.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-600">
              No differences computed yet.
            </div>
          )}
          {ops.map((op, i) => (
            <div key={i} className="mb-2 rounded border border-ink-700/70">
              <div className="border-b border-ink-700/70 bg-ink-800 px-2 py-0.5 text-2xs uppercase tracking-wide text-slate-500">
                {op.tag}
              </div>
              <div className="grid grid-cols-2 divide-x divide-ink-700/70">
                <pre
                  className={cn(
                    "whitespace-pre-wrap break-all p-2 font-mono text-2xs",
                    op.tag !== "insert" ? "bg-rose-500/10 text-rose-300" : "text-slate-600",
                  )}
                >
                  {op.left || "—"}
                </pre>
                <pre
                  className={cn(
                    "whitespace-pre-wrap break-all p-2 font-mono text-2xs",
                    op.tag !== "delete" ? "bg-emerald-500/10 text-emerald-300" : "text-slate-600",
                  )}
                >
                  {op.right || "—"}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
