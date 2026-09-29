"use client";

import { Check, ChartSpline } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChartStore, type ScaleMode } from "@/lib/store/chart-store";

const OPTIONS: { key: ScaleMode; label: string; hint: string }[] = [
  { key: "linear", label: "Lineal", hint: "Escala normal" },
  { key: "exponential", label: "Logarítmica", hint: "Igual % de cambio = igual altura · Alt+L" },
];

export function ScaleModeMenu() {
  const scaleMode = useChartStore((s) => s.scaleMode);
  const setScaleMode = useChartStore((s) => s.setScaleMode);
  const current = OPTIONS.find((o) => o.key === scaleMode) ?? OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover">
        <ChartSpline className="h-3.5 w-3.5" />
        <span>{current.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 bg-tv-panel">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Tipo de vista
          </DropdownMenuLabel>
          {OPTIONS.map((o) => (
            <DropdownMenuItem
              key={o.key}
              onClick={() => setScaleMode(o.key)}
              className="flex items-center justify-between text-xs"
            >
              <span className="flex flex-col">
                <span>{o.label}</span>
                <span className="text-[10px] text-tv-text-muted">{o.hint}</span>
              </span>
              {scaleMode === o.key && <Check className="h-3.5 w-3.5 text-tv-blue" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
