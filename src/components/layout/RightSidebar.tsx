"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { DEFAULT_WATCHLIST_WIDTH, useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 290;
const MAX_WIDTH = 640;

interface RightSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function RightSidebar({ open, onClose }: RightSidebarProps) {
  const width = useChartStore((s) => s.watchlistWidth);
  const setWidth = useChartStore((s) => s.setWatchlistWidth);
  const asideRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  // Applied outside of render so the persisted width (unknown to the server) can't cause a
  // hydration mismatch. Only desktop reads the variable; the mobile drawer keeps its fixed width.
  useLayoutEffect(() => {
    asideRef.current?.style.setProperty("--watchlist-w", `${width}px`);
  }, [width]);

  function clamp(w: number) {
    // Never let the panel squeeze the chart out of the window
    const max = Math.min(MAX_WIDTH, window.innerWidth - 360);
    return Math.round(Math.max(MIN_WIDTH, Math.min(max, w)));
  }

  return (
    <aside
      ref={asideRef}
      className={cn(
        "absolute inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-tv-border bg-tv-panel transition-transform duration-200 ease-out",
        "md:relative md:z-auto md:w-(--watchlist-w) md:shrink-0 md:translate-x-0",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Cambiar ancho de la watchlist"
        title="Arrastrar para cambiar el ancho · doble click para restablecer"
        onPointerDown={(e) => {
          if (e.button !== 0 || !asideRef.current) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const startWidth = asideRef.current.getBoundingClientRect().width;
          dragRef.current = { startX: e.clientX, startWidth, width: startWidth };
          setResizing(true);
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          // Written straight to the DOM while dragging; the store only gets the final value
          drag.width = clamp(drag.startWidth + drag.startX - e.clientX);
          asideRef.current?.style.setProperty("--watchlist-w", `${drag.width}px`);
        }}
        onPointerUp={() => {
          if (dragRef.current) setWidth(dragRef.current.width);
          dragRef.current = null;
          setResizing(false);
        }}
        onPointerCancel={() => {
          if (dragRef.current) setWidth(dragRef.current.width);
          dragRef.current = null;
          setResizing(false);
        }}
        onDoubleClick={() => setWidth(DEFAULT_WATCHLIST_WIDTH)}
        className={cn(
          "absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none transition-colors select-none hover:bg-tv-blue/50 md:block",
          resizing && "bg-tv-blue/70",
        )}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar watchlist"
        className="flex h-9 items-center justify-end border-b border-tv-border px-3 text-tv-text-muted hover:text-tv-text md:hidden"
      >
        <X className="h-4 w-4" />
      </button>
      <Watchlist />
    </aside>
  );
}
