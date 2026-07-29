"use client";

import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { TRENDLINE_COLORS } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Props {
  x: number;
  y: number;
  color: string;
  extendLeft: boolean;
  extendRight: boolean;
  onColorChange: (color: string) => void;
  onToggleExtendLeft: () => void;
  onToggleExtendRight: () => void;
  onDelete: () => void;
}

export function TrendLineToolbar({
  x,
  y,
  color,
  extendLeft,
  extendRight,
  onColorChange,
  onToggleExtendLeft,
  onToggleExtendRight,
  onDelete,
}: Props) {
  return (
    <div
      style={{ left: x, top: y }}
      className="absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded border border-tv-border bg-tv-panel px-1.5 py-1 shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {TRENDLINE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onColorChange(c)}
          style={{ backgroundColor: c }}
          className={cn(
            "h-4 w-4 rounded-full border-2 transition-transform hover:scale-110",
            color === c ? "border-tv-text" : "border-transparent",
          )}
        />
      ))}

      <div className="mx-0.5 h-4 w-px bg-tv-border" />

      <button
        type="button"
        aria-label="Extender a la izquierda"
        aria-pressed={extendLeft}
        onClick={onToggleExtendLeft}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
          extendLeft ? "bg-tv-blue/15 text-tv-blue" : "text-tv-text-muted",
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Extender a la derecha"
        aria-pressed={extendRight}
        onClick={onToggleExtendRight}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
          extendRight ? "bg-tv-blue/15 text-tv-blue" : "text-tv-text-muted",
        )}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-tv-border" />

      <button
        type="button"
        aria-label="Eliminar línea"
        onClick={onDelete}
        className="flex h-6 w-6 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
