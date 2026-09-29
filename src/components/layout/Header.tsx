"use client";

import { Bell, Camera, Code2, Moon, Sun, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { ScaleModeMenu } from "@/components/chart/ScaleModeMenu";
import { Separator } from "@/components/ui/separator";
import { useChartStore } from "@/lib/store/chart-store";
import { useAlertsStore } from "@/lib/store/alerts-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Header() {
  const requestScreenshot = useChartStore((s) => s.requestScreenshot);
  const theme = useChartStore((s) => s.theme);
  const toggleTheme = useChartStore((s) => s.toggleTheme);
  const setAlertsOpen = useAlertsStore((s) => s.setDialogOpen);
  const pendingAlerts = useAlertsStore((s) => s.alerts.filter((a) => !a.triggeredAt).length);

  return (
    <header className="flex h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
        <ScaleModeMenu />
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            onClick={() => setAlertsOpen(true)}
            aria-label="Alertas de precio"
            className="relative flex h-8 w-8 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <Bell className="h-4 w-4" />
            {pendingAlerts > 0 && (
              <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-tv-blue text-[9px] font-semibold text-white">
                {pendingAlerts}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Alertas de precio
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {theme === "dark" ? "Tema claro" : "Tema oscuro"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            onClick={requestScreenshot}
            aria-label="Capturar imagen"
            className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <Camera className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Capturar imagen
          </TooltipContent>
        </Tooltip>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Source</span>
        </a>
      </div>
    </header>
  );
}
