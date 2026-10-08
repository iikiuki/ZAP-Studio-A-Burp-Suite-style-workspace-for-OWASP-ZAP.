import { useRef, useState, useCallback, type ReactNode } from "react";
import { cn } from "../lib/format";

interface Props {
  direction?: "horizontal" | "vertical";
  initial?: number;
  min?: number;
  max?: number;
  first: ReactNode;
  second: ReactNode;
  className?: string;
}

/** Two-pane resizable splitter, the backbone of every Burp-style view. */
export function SplitPane({
  direction = "vertical",
  initial = 45,
  min = 15,
  max = 85,
  first,
  second,
  className,
}: Props) {
  const [pct, setPct] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMove = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el || !dragging.current) return;
      const rect = el.getBoundingClientRect();
      const ratio =
        direction === "vertical"
          ? ((clientX - rect.left) / rect.width) * 100
          : ((clientY - rect.top) / rect.height) * 100;
      setPct(Math.min(max, Math.max(min, ratio)));
    },
    [direction, max, min],
  );

  const stop = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const start = () => {
    dragging.current = true;
    document.body.style.cursor = direction === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      ref={ref}
      className={cn("flex h-full w-full overflow-hidden", direction === "vertical" ? "flex-row" : "flex-col", className)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onMouseUp={stop}
      onMouseLeave={stop}
    >
      <div className="overflow-hidden" style={{ [direction === "vertical" ? "width" : "height"]: `${pct}%` }}>
        {first}
      </div>
      <div
        onMouseDown={start}
        className={cn(
          "shrink-0 bg-ink-800 hover:bg-brand-500/60 transition-colors",
          direction === "vertical" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
      />
      <div className="flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
