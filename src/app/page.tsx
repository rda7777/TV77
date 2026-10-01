"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { AlertsDialog } from "@/components/alerts/AlertsDialog";
import { AlertsWatcher } from "@/components/alerts/AlertsWatcher";
import { useChartStore } from "@/lib/store/chart-store";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header onToggleWatchlist={() => setWatchlistOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>
        {watchlistOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setWatchlistOpen(false)}
          />
        )}
        <RightSidebar open={watchlistOpen} onClose={() => setWatchlistOpen(false)} />
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
      <AlertsDialog />
      <AlertsWatcher />
    </div>
  );
}
