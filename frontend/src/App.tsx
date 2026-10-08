import { useState } from "react";
import { useApp } from "./store/app";
import { useEventStream } from "./lib/ws";
import { TabBar } from "./components/TabBar";
import { StatusBar } from "./components/StatusBar";
import { Toasts } from "./components/Toasts";
import { Dashboard } from "./features/dashboard/Dashboard";
import { TargetView } from "./features/target/TargetView";
import { ProxyView } from "./features/proxy/ProxyView";
import { SpiderView } from "./features/scanner/SpiderView";
import { ScannerView } from "./features/scanner/ScannerView";
import { IntruderView } from "./features/intruder/IntruderView";
import { RepeaterView } from "./features/repeater/RepeaterView";
import { AlertsView } from "./features/alerts/AlertsView";
import { DecoderView } from "./features/tools/DecoderView";
import { ComparerView } from "./features/tools/ComparerView";
import { ReportsView } from "./features/reports/ReportsView";
import { SettingsDrawer } from "./features/settings/SettingsDrawer";
import { ShieldCheck } from "lucide-react";

export function App() {
  const activeTab = useApp((s) => s.activeTab);
  const setHistoryCount = useApp((s) => s.setHistoryCount);
  const setAlertCount = useApp((s) => s.setAlertCount);
  const setIntercepting = useApp((s) => s.setIntercepting);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEventStream((event) => {
    switch (event.channel) {
      case "hello": {
        const data = event.data as { history?: { count: number }; alerts?: { count: number } };
        if (data.history) setHistoryCount(data.history.count);
        if (data.alerts) setAlertCount(data.alerts.count);
        break;
      }
      case "history":
        setHistoryCount((event.data as { count: number }).count);
        break;
      case "alerts":
        setAlertCount((event.data as { count: number }).count);
        break;
      case "intercept":
        setIntercepting(Boolean((event.data as { active: boolean }).active));
        break;
      default:
        break;
    }
  });

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <header className="flex h-11 items-center gap-3 border-b border-ink-700/70 bg-ink-900 px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-500">
            <ShieldCheck size={15} className="text-ink-950" />
          </div>
          <div className="leading-none">
            <div className="text-sm font-semibold tracking-tight text-slate-100">
              ZAP <span className="text-brand-500">Studio</span>
            </div>
            <div className="text-2xs text-slate-500">OWASP ZAP, reimagined</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-2xs text-slate-500">
          <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5">Ctrl+K</kbd>
          command palette
        </div>
      </header>

      <TabBar onOpenSettings={() => setSettingsOpen(true)} />

      <main className="flex-1 overflow-hidden">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "target" && <TargetView />}
        {activeTab === "proxy" && <ProxyView />}
        {activeTab === "spider" && <SpiderView />}
        {activeTab === "scanner" && <ScannerView />}
        {activeTab === "intruder" && <IntruderView />}
        {activeTab === "repeater" && <RepeaterView />}
        {activeTab === "alerts" && <AlertsView />}
        {activeTab === "decoder" && <DecoderView />}
        {activeTab === "comparer" && <ComparerView />}
        {activeTab === "reports" && <ReportsView />}
      </main>

      <StatusBar />
      <Toasts />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
