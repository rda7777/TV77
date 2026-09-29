"use client";

import { Trash2 } from "lucide-react";
import { TRENDLINE_COLORS } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Props {
  x: number;
  y: number;
  color: string;
  fillColor: string;
  onColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onDelete: () => void;
}

export function SwatchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-11 text-[10px] text-tv-text-muted">{label}</span>
      {TRENDLINE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          className={cn(
            "h-4 w-4 rounded-full border-2 transition-transform hover:scale-110",
            value === c ? "border-tv-text" : "border-transparent",
          )}
        />
      ))}
    </div>
  );
}

export function RectangleToolbar({
  x,
  y,
  color,
  fillColor,
  onColorChange,
  onFillColorChange,
  onDelete,
}: Props) {
  return (
    <div
      style={{ left: x, top: y }}
      className="absolute z-30 flex -translate-x-1/2 items-center gap-2 rounded border border-tv-border bg-tv-panel px-2 py-1.5 shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-1.5">
        <SwatchRow label="Borde" value={color} onChange={onColorChange} />
        <SwatchRow label="Relleno" value={fillColor} onChange={onFillColorChange} />
      </div>

      <div className="h-8 w-px bg-tv-border" />

      <button
        type="button"
        aria-label="Eliminar rectángulo"
        onClick={onDelete}
        className="flex h-6 w-6 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
