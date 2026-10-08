import type {
  Alert,
  FullMessage,
  HistoryItem,
  IntruderResult,
  ReportTemplate,
  Scan,
  Scanner,
  SendResult,
  ZapStatus,
} from "../types";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
      code = body.code;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(detail, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export interface IntruderPayload {
  request: string;
  attackType: string;
  payloadSets: string[][];
  threads?: number;
  delayMs?: number;
  followRedirects?: boolean;
}

export const api = {
  system: {
    status: () => request<ZapStatus>("/api/system/status"),
    startZap: () => post<{ status: string; version: string | null }>("/api/system/zap/start"),
    stopZap: () => post<{ status: string }>("/api/system/zap/stop"),
    ensureProxy: () => post<{ proxy: Record<string, unknown> }>("/api/system/zap/proxy"),
    newSession: (name = "", overwrite = true) =>
      post<{ status: string }>(`/api/system/session/new?name=${encodeURIComponent(name)}&overwrite=${overwrite}`),
    saveSession: (name: string) =>
      post<{ location: string }>(`/api/system/session/save?name=${encodeURIComponent(name)}`),
  },
  proxy: {
    history: (params: { baseurl?: string; start?: number; count?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.baseurl) q.set("baseurl", params.baseurl);
      q.set("start", String(params.start ?? 0));
      q.set("count", String(params.count ?? 200));
      return request<HistoryItem[]>(`/api/proxy/history?${q}`);
    },
    count: () => request<{ count: number }>("/api/proxy/history/count"),
    message: (id: string) => request<FullMessage>(`/api/proxy/message/${id}`),
    clear: () => post<{ status: string }>("/api/proxy/history/clear"),
    send: (payload: {
      raw?: string;
      method?: string;
      url?: string;
      headers?: unknown;
      body?: string;
      followRedirects?: boolean;
    }) => post<SendResult>("/api/proxy/send", payload),
    interceptState: () => request<{ active: boolean; message: string }>("/api/proxy/intercept"),
    setIntercept: (active: boolean, type = "http") =>
      post<{ active: boolean }>("/api/proxy/intercept", { active, type }),
    continueIntercept: (action: "continue" | "step" | "drop", message?: string) =>
      post<{ status: string }>("/api/proxy/intercept/continue", { action, message }),
    breakpoint: () =>
      request<{ active: boolean; message: string; request: unknown }>("/api/proxy/breakpoint"),
  },
  target: {
    sites: () => request<{ sites: string[] }>("/api/target/sites"),
    urls: (baseurl: string) =>
      request<{ urls: string[] }>(`/api/target/urls?baseurl=${encodeURIComponent(baseurl)}`),
    hosts: () => request<{ hosts: string[] }>("/api/target/hosts"),
    access: (url: string, followRedirects = true) =>
      post<{ status: string }>("/api/target/access", { url, followRedirects }),
    contexts: () => request<{ contexts: string[] }>("/api/target/contexts"),
    search: (kind: string, regex: string, baseurl?: string) => {
      const q = new URLSearchParams({ kind, regex });
      if (baseurl) q.set("baseurl", baseurl);
      return request<{ kind: string; regex: string; result: unknown }>(`/api/target/search?${q}`);
    },
    excluded: () => request<{ excluded: string[] }>("/api/target/excluded"),
    exclude: (regex: string) => post<{ status: string }>("/api/target/excluded", { regex }),
  },
  scans: {
    spider: () => request<{ scans: Scan[] }>("/api/scans/spider"),
    startSpider: (payload: {
      url: string;
      recurse?: boolean;
      subtreeOnly?: boolean;
      maxChildren?: string;
      contextName?: string;
    }) => post<{ scanId: string }>("/api/scans/spider", payload),
    stopSpider: (id: string) => post<{ status: string }>(`/api/scans/spider/${id}/stop`),
    stopAllSpider: () => post<{ status: string }>("/api/scans/spider/stop-all"),
    spiderResults: (id: string) => request<{ urls: string[] }>(`/api/scans/spider/${id}/results`),
    ajaxStatus: () => request<{ state: string }>("/api/scans/ajax"),
    startAjax: (payload: { url: string; inScope?: boolean; subtreeOnly?: boolean }) =>
      post<{ status: string }>("/api/scans/ajax", payload),
    stopAjax: () => post<{ status: string }>("/api/scans/ajax/stop"),
    ajaxResults: () => request<{ results: string[] }>("/api/scans/ajax/results"),
    ascan: () => request<{ scans: Scan[] }>("/api/scans/ascan"),
    startActive: (payload: {
      url: string;
      recurse?: boolean;
      inScopeOnly?: boolean;
      scanPolicyName?: string;
      method?: string;
      postData?: string;
    }) => post<{ scanId: string }>("/api/scans/ascan", payload),
    activeStatus: (id: string) =>
      request<{ scanId: string; state: string }>(`/api/scans/ascan/${id}/status`),
    activeProgress: (id: string) =>
      request<{ scanId: string; progress: number }>(`/api/scans/ascan/${id}/progress`),
    stopActive: (id: string) => post<{ status: string }>(`/api/scans/ascan/${id}/stop`),
    pauseActive: (id: string) => post<{ status: string }>(`/api/scans/ascan/${id}/pause`),
    resumeActive: (id: string) => post<{ status: string }>(`/api/scans/ascan/${id}/resume`),
    activeScanners: (policy?: string) =>
      request<{ scanners: Scanner[] }>(`/api/scans/ascan/scanners${policy ? `?policy=${policy}` : ""}`),
    enableScanners: (ids: string[]) =>
      post<{ status: string }>("/api/scans/ascan/scanners/enable", { ids }),
    disableScanners: (ids: string[]) =>
      post<{ status: string }>("/api/scans/ascan/scanners/disable", { ids }),
    passiveScanners: () => request<{ scanners: Scanner[] }>("/api/scans/pscan/scanners"),
    passiveRecords: () => request<{ recordsToScan: number }>("/api/scans/pscan/records"),
    setPassiveThreshold: (id: string, alertThreshold: string) =>
      post<{ status: string }>("/api/scans/pscan/scanners/threshold", { id, alertThreshold }),
  },
  alerts: {
    list: (params: { baseurl?: string; start?: number; count?: number; riskId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.baseurl) q.set("baseurl", params.baseurl);
      if (params.riskId) q.set("riskId", params.riskId);
      q.set("start", String(params.start ?? 0));
      q.set("count", String(params.count ?? 500));
      return request<Alert[]>(`/api/alerts?${q}`);
    },
    summary: (baseurl?: string) =>
      request<Record<string, unknown>>(
        `/api/alerts/summary${baseurl ? `?baseurl=${encodeURIComponent(baseurl)}` : ""}`,
      ),
    counts: () => request<Record<string, unknown>>("/api/alerts/counts"),
    count: () => request<{ count: number }>("/api/alerts/count"),
    clear: () => post<{ status: string }>("/api/alerts/clear"),
  },
  repeater: {
    send: (payload: {
      raw?: string;
      url?: string;
      method?: string;
      headers?: unknown;
      body?: string;
      followRedirects?: boolean;
    }) => post<SendResult>("/api/repeater/send", payload),
  },
  intruder: {
    preview: (payload: IntruderPayload) =>
      post<{ total: number; sample: string[] }>("/api/intruder/preview", payload),
    createRun: (payload: IntruderPayload) =>
      post<{ runId: string; total: number }>("/api/intruder/runs", payload),
    getRun: (id: string) =>
      request<{ runId: string; finished: boolean; total: number; results: IntruderResult[] }>(
        `/api/intruder/runs/${id}`,
      ),
    cancel: (id: string) => post<{ status: string }>(`/api/intruder/runs/${id}/cancel`),
    streamUrl: (id: string) => `/api/intruder/runs/${id}/stream`,
  },
  reports: {
    templates: () => request<{ templates: ReportTemplate[] }>("/api/reports/templates"),
    generate: (payload: Record<string, unknown>) =>
      post<{ file: string; filename: string }>("/api/reports/generate", payload),
    downloadUrl: (filename: string) =>
      `/api/reports/download?filename=${encodeURIComponent(filename)}`,
  },
  tools: {
    encoders: () => request<{ encoders: string[] }>("/api/tools/encoders"),
    transform: (input: string, transformations: { kind: string; direction: string }[]) =>
      post<{ output: string; steps: { kind: string; direction: string; output: string }[] }>(
        "/api/tools/transform",
        { input, transformations },
      ),
    diff: (left: string, right: string, mode: string) =>
      post<{
        operations: { tag: string; left: string; right: string }[];
        added: number;
        removed: number;
        similarity: number;
      }>("/api/tools/diff", { left, right, mode }),
    formatJson: (input: string) => post<{ output: string }>("/api/tools/json/format", { input }),
  },
};
