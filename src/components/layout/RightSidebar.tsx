"use client";

import { X } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { cn } from "@/lib/utils";

interface RightSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function RightSidebar({ open, onClose }: RightSidebarProps) {
  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-tv-border bg-tv-panel transition-transform duration-200 ease-out",
        "md:static md:z-auto md:w-64 md:translate-x-0",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
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
