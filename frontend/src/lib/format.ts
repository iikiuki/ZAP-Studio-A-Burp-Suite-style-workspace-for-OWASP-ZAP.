import type { HttpHeader } from "../types";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function statusColor(status: number): string {
  if (status >= 500) return "text-rose-400";
  if (status >= 400) return "text-amber-400";
  if (status >= 300) return "text-sky-400";
  if (status >= 200) return "text-emerald-400";
  return "text-slate-400";
}

export function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-emerald-400";
    case "POST":
      return "text-amber-400";
    case "PUT":
      return "text-sky-400";
    case "DELETE":
      return "text-rose-400";
    case "PATCH":
      return "text-fuchsia-400";
    default:
      return "text-slate-300";
  }
}

export type Risk = "High" | "Medium" | "Low" | "Informational";

export function normalizeRisk(risk: string): Risk {
  const value = (risk || "").toLowerCase();
  if (value.startsWith("high")) return "High";
  if (value.startsWith("med")) return "Medium";
  if (value.startsWith("low")) return "Low";
  return "Informational";
}

export function riskClass(risk: string): string {
  const normalized = normalizeRisk(risk);
  return `risk-${normalized.toLowerCase()} chip`;
}

export function riskRank(risk: string): number {
  switch (normalizeRisk(risk)) {
    case "High":
      return 0;
    case "Medium":
      return 1;
    case "Low":
      return 2;
    default:
      return 3;
  }
}

export function serializeHeaders(headers: HttpHeader[]): string {
  return headers.map((h) => `${h.name}: ${h.value}`).join("\n");
}

export function parseHeaders(text: string): HttpHeader[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { name: line, value: "" };
      return { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html|head|body|div|span|p\b)/i.test(text);
}

export function shortUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + "…";
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
