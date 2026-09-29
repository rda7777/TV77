"use client";

import { Trash2 } from "lucide-react";
import { SwatchRow } from "./RectangleToolbar";

interface Props {
  x: number;
  y: number;
  color: string;
  onColorChange: (color: string) => void;
  onDelete: () => void;
}

export function ArrowToolbar({ x, y, color, onColorChange, onDelete }: Props) {
  return (
    <div
      style={{ left: x, top: y }}
      className="absolute z-30 flex -translate-x-1/2 items-center gap-2 rounded border border-tv-border bg-tv-panel px-2 py-1.5 shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <SwatchRow label="Color" value={color} onChange={onColorChange} />

      <div className="h-5 w-px bg-tv-border" />

      <button
        type="button"
        aria-label="Eliminar flecha"
        onClick={onDelete}
        className="flex h-6 w-6 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
