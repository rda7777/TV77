"use client";

import { useLayoutEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";

export function ThemeSync() {
  const theme = useChartStore((s) => s.theme);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return null;
}
