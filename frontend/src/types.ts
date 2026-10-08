export interface ProxyServer {
  address: string;
  port: number;
  proxy: boolean;
  enabled: boolean;
  api: boolean;
}

export interface ZapStatus {
  running: boolean;
  version: string | null;
  managed: boolean;
  external: boolean;
  zapPath: string | null;
  apiUrl: string;
  proxy: ProxyServer | null;
  autostart: boolean;
  platform: string;
}

export interface HttpHeader {
  name: string;
  value: string;
}

export interface HttpRequest {
  method: string;
  target: string;
  version: string;
  host: string;
  url: string;
  path: string;
  headers: HttpHeader[];
  body: string;
}

export interface HttpResponse {
  statusLine: string;
  status: number;
  reason: string;
  headers: HttpHeader[];
  body: string;
  length: number;
}

export interface FullMessage {
  id: string;
  request: HttpRequest;
  requestRaw: string;
  response: HttpResponse;
  responseRaw: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  status: number;
  length: number;
  rtt: number;
  mimeType: string;
  note: string;
  tags: string[];
}

export interface Alert {
  id: string;
  name: string;
  risk: string;
  confidence: string;
  url: string;
  param: string;
  attack: string;
  evidence: string;
  description: string;
  solution: string;
  reference: string;
  cweId: string;
  wascId: string;
  sourceId: string;
  alertRef: string;
  pluginId: string;
  messageId: string;
  method: string;
  tags: Record<string, string>;
}

export interface Scan {
  id: string;
  state?: string;
  progress?: string;
  url?: string;
  [key: string]: unknown;
}

export interface Scanner {
  id: string;
  name: string;
  enabled: string;
  quality: string;
  status: string;
  alertThreshold?: string;
  [key: string]: unknown;
}

export interface ReportTemplate {
  name: string;
  extension: string;
}

export interface SendResult {
  request: HttpRequest;
  requestRaw: string;
  response: HttpResponse;
  responseRaw: string;
  rtt: number;
  redirects: number;
}

export interface IntruderResult {
  index: number;
  payloads: string[];
  status: number;
  length: number;
  rtt: number;
  requestHeader: string;
  responseHeader: string;
  responseBody: string;
  error: string | null;
}

export type TabId =
  | "dashboard"
  | "target"
  | "proxy"
  | "spider"
  | "scanner"
  | "intruder"
  | "repeater"
  | "alerts"
  | "decoder"
  | "comparer"
  | "reports"
  | "settings";

export interface TabDef {
  id: TabId;
  label: string;
  hint?: string;
}
