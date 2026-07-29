"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AlertCondition = "above" | "below";

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  targetPrice: number;
  email: string;
  createdAt: number;
  triggeredAt: number | null;
}

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

interface AlertsState {
  alerts: PriceAlert[];
  dialogOpen: boolean;
  addAlert: (a: Omit<PriceAlert, "id" | "createdAt" | "triggeredAt">) => void;
  removeAlert: (id: string) => void;
  markTriggered: (id: string) => void;
  setDialogOpen: (v: boolean) => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      dialogOpen: false,
      addAlert: (a) =>
        set((state) => ({
          alerts: [
            ...state.alerts,
            { ...a, id: genId(), createdAt: Date.now(), triggeredAt: null },
          ],
        })),
      removeAlert: (id) =>
        set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),
      markTriggered: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, triggeredAt: Date.now() } : a,
          ),
        })),
      setDialogOpen: (dialogOpen) => set({ dialogOpen }),
    }),
    {
      name: "tv-gratis-alerts",
      version: 1,
      partialize: (s) => ({ alerts: s.alerts }),
    },
  ),
);
