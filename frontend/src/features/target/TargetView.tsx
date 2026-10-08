import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { Panel } from "../../components/Panel";
import { cn, shortUrl } from "../../lib/format";
import { useApp } from "../../store/app";
import { ChevronDown, ChevronRight, Crosshair, FolderTree, RefreshCw, Search } from "lucide-react";

interface SiteNode {
  url: string;
  children: string[];
  collapsed: boolean;
}

export function TargetView() {
  const toast = useApp((s) => s.toast);
  const [sites, setSites] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const loadSites = async () => {
    try {
      const { sites: found } = await api.target.sites();
      setSites(found);
      if (!selectedHost && found.length) setSelectedHost(found[0]);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load site map");
    }
  };

  const loadUrls = async (host: string) => {
    try {
      const { urls: found } = await api.target.urls(host);
      setUrls(found);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load URLs");
    }
  };

  useEffect(() => {
    loadSites();
    const timer = setInterval(loadSites, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedHost) loadUrls(selectedHost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHost]);

  const tree = useMemo<SiteNode[]>(() => {
    const filtered = urls.filter((u) => u.toLowerCase().includes(filter.toLowerCase()));
    const byPath = new Map<string, string[]>();
    filtered.forEach((url) => {
      try {
        const parsed = new URL(url);
        const dir = parsed.pathname.replace(/\/[^/]*$/, "/") || "/";
        const list = byPath.get(dir) ?? [];
        list.push(url);
        byPath.set(dir, list);
      } catch {
        /* skip malformed */
      }
    });
    return [...byPath.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dir, children]) => ({ url: dir, children, collapsed: !expanded[dir] }));
  }, [urls, filter, expanded]);

  const runSearch = async () => {
    if (!query) return;
    try {
      const res = await api.target.search("url", query, selectedHost ?? undefined);
      const result = res.result;
      const list = Array.isArray(result) ? result : result ? [String(result)] : [];
      setSearchResults(list as string[]);
      toast("success", `Found ${list.length} matching URLs`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Search failed");
    }
  };

  const scan = async (url: string, mode: "spider" | "active") => {
    try {
      if (mode === "spider") await api.scans.startSpider({ url, recurse: true });
      else await api.scans.startActive({ url, recurse: true });
      toast("success", `${mode === "spider" ? "Spider" : "Active scan"} started for ${shortUrl(url, 40)}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to start scan");
    }
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-ink-700/70 bg-ink-850">
        <div className="toolbar justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <FolderTree size={13} /> Site map
          </span>
          <button className="btn" onClick={loadSites} title="Refresh">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-1">
          {sites.length === 0 && (
            <div className="px-3 py-6 text-center text-2xs text-slate-500">
              No hosts yet. Send traffic through the proxy.
            </div>
          )}
          {sites.map((site) => (
            <button
              key={site}
              onClick={() => setSelectedHost(site)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
                selectedHost === site ? "bg-brand-500/15 text-brand-400" : "text-slate-300 hover:bg-ink-800",
              )}
            >
              <ChevronRight size={12} className="text-slate-500" />
              <span className="truncate">{shortUrl(site, 34)}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="toolbar gap-2">
          <Search size={13} className="text-slate-500" />
          <input
            className="input flex-1"
            placeholder="Filter URLs in this host…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <input
            className="input w-56"
            placeholder="Regex search across history"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <button className="btn" onClick={runSearch}>
            Search
          </button>
        </div>

        <Panel
          title={selectedHost ? shortUrl(selectedHost, 60) : "Select a host"}
          subtitle={`${urls.length} URLs`}
          className="flex-1"
        >
          <div className="h-full overflow-auto">
            {tree.map((node) => (
              <div key={node.url}>
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [node.url]: !prev[node.url] }))}
                  className="flex w-full items-center gap-1.5 border-b border-ink-800/60 bg-ink-800/40 px-2 py-1 text-left text-2xs text-slate-300 hover:bg-ink-800"
                >
                  {expanded[node.url] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-mono text-accent-400">{node.url}</span>
                  <span className="ml-auto text-slate-600">{node.children.length}</span>
                </button>
                {expanded[node.url] &&
                  node.children.map((url) => (
                    <div
                      key={url}
                      className="group flex items-center gap-2 border-b border-ink-800/40 px-6 py-1 text-2xs hover:bg-ink-800/50"
                    >
                      <span className="truncate font-mono text-slate-400">{shortUrl(url, 90)}</span>
                      <div className="ml-auto hidden items-center gap-1 group-hover:flex">
                        <button className="btn" onClick={() => scan(url, "spider")} title="Spider this URL">
                          <Crosshair size={11} />
                        </button>
                        <button className="btn" onClick={() => scan(url, "active")} title="Active scan this URL">
                          Active
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ))}
            {tree.length === 0 && (
              <div className="px-3 py-10 text-center text-xs text-slate-500">
                {selectedHost ? "No URLs captured for this host yet." : "Pick a host on the left."}
              </div>
            )}
          </div>
        </Panel>

        {searchResults.length > 0 && (
          <Panel title="Regex search results" subtitle={`${searchResults.length} hits`} className="h-48 shrink-0 border-t border-ink-700/70">
            <div className="h-full overflow-auto p-2 font-mono text-2xs text-slate-400">
              {searchResults.map((r) => (
                <div key={r} className="truncate">
                  {r}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
