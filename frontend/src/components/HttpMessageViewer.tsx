import { useMemo, useState } from "react";
import { cn, prettyJson, statusColor } from "../lib/format";
import type { HttpHeader } from "../types";

type ViewMode = "raw" | "headers" | "params" | "hex" | "render";

interface Props {
  title: string;
  raw: string;
  headers?: HttpHeader[];
  body?: string;
  status?: number;
  statusLine?: string;
  editable?: boolean;
  onChange?: (raw: string) => void;
  className?: string;
}

function toHexDump(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.slice(offset, offset + 16);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(47, " ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }
  return lines.join("\n");
}

export function HttpMessageViewer({
  title,
  raw,
  headers = [],
  body = "",
  status,
  statusLine,
  editable = false,
  onChange,
  className,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("raw");

  const params = useMemo(() => {
    const requestLine = raw.split("\n")[0] ?? "";
    const target = requestLine.split(" ")[1] ?? "";
    const query = target.includes("?") ? target.split("?")[1] : "";
    const items = new URLSearchParams(query);
    const rows: { name: string; value: string; source: string }[] = [];
    items.forEach((value, name) => rows.push({ name, value, source: "query" }));
    if (body && /^[\w.~%+-]+=[\s\S]*/.test(body.trim())) {
      new URLSearchParams(body).forEach((value, name) => rows.push({ name, value, source: "body" }));
    }
    return rows;
  }, [raw, body]);

  const modes: ViewMode[] = ["raw", "headers", "params", "hex", "render"];

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="toolbar justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">{title}</span>
          {statusLine && (
            <span className={cn("font-mono text-2xs", statusColor(status ?? 0))}>
              {statusLine.slice(0, 40)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2 py-0.5 text-2xs capitalize transition-colors",
                mode === m ? "bg-brand-500/20 text-brand-400" : "text-slate-400 hover:text-slate-200",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === "raw" && (
        editable ? (
          <textarea
            value={raw}
            onChange={(e) => onChange?.(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full resize-none bg-ink-900 p-2 font-mono text-2xs text-slate-200 focus:outline-none"
          />
        ) : (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all bg-ink-900 p-2 font-mono text-2xs text-slate-200">
            {raw}
          </pre>
        )
      )}

      {mode === "headers" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-2xs">
            <tbody>
              {headers.length === 0 && (
                <tr>
                  <td className="px-2 py-3 text-slate-500">No headers</td>
                </tr>
              )}
              {headers.map((h, i) => (
                <tr key={`${h.name}-${i}`} className="border-b border-ink-800/60">
                  <td className="px-2 py-1 font-semibold text-brand-400 w-1/3">{h.name}</td>
                  <td className="px-2 py-1 break-all text-slate-300">{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "params" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-2xs">
            <thead className="bg-ink-800">
              <tr>
                <th className="px-2 py-1 text-left text-slate-400">Source</th>
                <th className="px-2 py-1 text-left text-slate-400">Name</th>
                <th className="px-2 py-1 text-left text-slate-400">Value</th>
              </tr>
            </thead>
            <tbody>
              {params.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-slate-500">
                    No parameters detected
                  </td>
                </tr>
              )}
              {params.map((p, i) => (
                <tr key={`${p.source}-${p.name}-${i}`} className="border-b border-ink-800/60">
                  <td className="px-2 py-1 text-slate-500">{p.source}</td>
                  <td className="px-2 py-1 text-accent-400">{p.name}</td>
                  <td className="px-2 py-1 break-all text-slate-300">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "hex" && (
        <pre className="flex-1 overflow-auto whitespace-pre bg-ink-900 p-2 font-mono text-2xs text-slate-300">
          {toHexDump(raw)}
        </pre>
      )}

      {mode === "render" && (
        <div className="flex-1 overflow-auto bg-white">
          {body ? (
            <iframe
              title="render"
              sandbox=""
              className="h-full w-full"
              srcDoc={body}
            />
          ) : (
            <div className="p-3 text-xs text-slate-500">No body to render</div>
          )}
        </div>
      )}

      {mode !== "render" && body && mode === "raw" && null}
      {mode === "raw" && body && /^\s*[{[]/.test(body) && (
        <div className="border-t border-ink-700 max-h-1/3 overflow-auto">
          <div className="px-2 py-1 text-2xs text-slate-500 bg-ink-800">Pretty JSON preview</div>
          <pre className="p-2 font-mono text-2xs text-emerald-300/90">{prettyJson(body)}</pre>
        </div>
      )}
    </div>
  );
}
