import { useEffect } from "react";
import { useApp } from "../store/app";
import { cn } from "../lib/format";
import type { TabId } from "../types";
import {
  Activity,
  Bug,
  Code2,
  Crosshair,
  GitCompare,
  LayoutDashboard,
  Repeat,
  Send,
  Settings,
  ShieldAlert,
  Target,
  FileText,
  type LucideIcon,
} from "lucide-react";

interface TabMeta {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export const TABS: TabMeta[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "target", label: "Target", icon: Target },
  { id: "proxy", label: "Proxy", icon: Repeat },
  { id: "spider", label: "Spider", icon: Crosshair },
  { id: "scanner", label: "Scanner", icon: Activity },
  { id: "intruder", label: "Intruder", icon: Send },
  { id: "repeater", label: "Repeater", icon: Code2 },
  { id: "alerts", label: "Issues", icon: ShieldAlert },
  { id: "decoder", label: "Decoder", icon: Bug },
  { id: "comparer", label: "Comparer", icon: GitCompare },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

interface Props {
  onOpenSettings: () => void;
}

export function TabBar({ onOpenSettings }: Props) {
  const activeTab = useApp((s) => s.activeTab);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const alertCount = useApp((s) => s.alertCount);
  const historyCount = useApp((s) => s.historyCount);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const index = Number(e.key);
      if (Number.isInteger(index) && index >= 1 && index <= TABS.length) {
        e.preventDefault();
        setActiveTab(TABS[index - 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveTab]);

  const badgeFor = (id: TabId) => {
    if (id === "alerts" && alertCount > 0) return alertCount;
    if (id === "proxy" && historyCount > 0) return historyCount;
    return null;
  };

  return (
    <nav className="flex items-stretch gap-0.5 overflow-x-auto border-b border-ink-700/70 bg-ink-900 px-1.5">
      {TABS.map((tab, i) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        const badge = badgeFor(tab.id);
        return (
          <button
            key={tab.id}
            onClick={() => (tab.id === "settings" ? onOpenSettings() : setActiveTab(tab.id))}
            title={`Ctrl+${i + 1}`}
            className={cn(
              "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors",
              active
                ? "text-brand-400 after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-brand-500 after:rounded-t"
                : "text-slate-400 hover:text-slate-200 hover:bg-ink-800/60",
            )}
          >
            <Icon size={13} />
            {tab.label}
            {badge !== null && (
              <span className="ml-0.5 rounded-full bg-ink-700 px-1.5 text-2xs text-slate-300">
                {badge > 999 ? "999+" : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
