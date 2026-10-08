import { useEffect, useState } from "react";
import { api } from "../../api/client";

import { useApp } from "../../store/app";
import { ArrowRight, Copy, Eraser, Play, Plus, Trash2 } from "lucide-react";

interface Step {
  kind: string;
  direction: "encode" | "decode";
}

const FALLBACK = [
  "base64", "base64url", "url", "html", "hex", "ascii-hex", "gzip-base64", "md5", "sha1", "sha256",
];

export function DecoderView() {
  const toast = useApp((s) => s.toast);
  const [input, setInput] = useState("Hello, ZAP Studio!");
  const [steps, setSteps] = useState<Step[]>([{ kind: "base64", direction: "encode" }]);
  const [output, setOutput] = useState("");
  const [encoders, setEncoders] = useState<string[]>(FALLBACK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.tools
      .encoders()
      .then((r) => setEncoders(r.encoders))
      .catch(() => undefined);
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.tools.transform(input, steps);
      setOutput(res.output);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Transform failed");
    } finally {
      setBusy(false);
    }
  };

  const addStep = () => setSteps((prev) => [...prev, { kind: "url", direction: "encode" }]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">Decoder</span>
        <span className="text-2xs text-slate-500">
          Chain encoders and hashers to transform payloads. Order runs top to bottom.
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 overflow-hidden">
        <div className="panel flex flex-col">
          <div className="toolbar justify-between">
            <span className="text-xs font-semibold text-slate-200">Input</span>
            <button className="btn" onClick={() => setInput("")}>
              <Eraser size={12} /> Clear
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="flex-1 resize-none bg-ink-900 p-2 font-mono text-xs text-slate-200 focus:outline-none"
          />
        </div>

        <div className="panel flex flex-col">
          <div className="toolbar justify-between">
            <span className="text-xs font-semibold text-slate-200">Output</span>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(output);
                toast("success", "Copied to clipboard");
              }}
              disabled={!output}
            >
              <Copy size={12} /> Copy
            </button>
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all bg-ink-900 p-2 font-mono text-xs text-emerald-300/90">
            {output || "Output appears here."}
          </pre>
        </div>
      </div>

      <div className="mt-3 panel">
        <div className="toolbar justify-between">
          <span className="text-xs font-semibold text-slate-200">Transform chain</span>
          <div className="flex gap-1.5">
            <button className="btn" onClick={addStep}>
              <Plus size={12} /> Add step
            </button>
            <button className="btn-primary" onClick={run} disabled={busy}>
              <Play size={12} /> Run
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded bg-ink-800 px-2 py-1">
              <span className="text-2xs text-slate-500">{i + 1}</span>
              <select
                className="input"
                value={step.direction}
                onChange={(e) => updateStep(i, { direction: e.target.value as Step["direction"] })}
              >
                <option value="encode">Encode</option>
                <option value="decode">Decode</option>
              </select>
              <select
                className="input"
                value={step.kind}
                onChange={(e) => updateStep(i, { kind: e.target.value })}
              >
                {encoders.map((enc) => (
                  <option key={enc} value={enc}>
                    {enc}
                  </option>
                ))}
              </select>
              <button
                className="text-slate-500 hover:text-rose-400"
                onClick={() => removeStep(i)}
                disabled={steps.length === 1}
              >
                <Trash2 size={12} />
              </button>
              {i < steps.length - 1 && <ArrowRight size={12} className="text-slate-600" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
