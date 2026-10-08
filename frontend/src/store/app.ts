import { create } from "zustand";
import type { Alert, TabId, ZapStatus } from "../types";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

interface AppState {
  activeTab: TabId;
  status: ZapStatus | null;
  historyCount: number;
  alertCount: number;
  alerts: Alert[];
  intercepting: boolean;
  toasts: Toast[];

  setActiveTab: (tab: TabId) => void;
  setStatus: (status: ZapStatus | null) => void;
  setHistoryCount: (count: number) => void;
  setAlertCount: (count: number) => void;
  setAlerts: (alerts: Alert[]) => void;
  setIntercepting: (active: boolean) => void;
  toast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set) => ({
  activeTab: "dashboard",
  status: null,
  historyCount: 0,
  alertCount: 0,
  alerts: [],
  intercepting: false,
  toasts: [],

  setActiveTab: (activeTab) => set({ activeTab }),
  setStatus: (status) => set({ status }),
  setHistoryCount: (historyCount) => set({ historyCount }),
  setAlertCount: (alertCount) => set({ alertCount }),
  setAlerts: (alerts) => set({ alerts }),
  setIntercepting: (intercepting) => set({ intercepting }),
  toast: (kind, message) => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Small helper so non-React modules can raise toasts. */
export const notify = (kind: Toast["kind"], message: string) => useApp.getState().toast(kind, message);
