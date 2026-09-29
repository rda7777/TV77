import { useChartStore } from "./chart-store";

// Everything the app remembers (watchlists, notes, drawings, indicators…) lives in the browser's
// localStorage, which is per site: localhost and the online version don't share it. A backup file
// carries it from one to the other — it's exactly the persisted blob, so importing it goes through
// the store's own migrate/merge like a normal page load.

/** Downloads the saved state as a JSON file */
export function exportBackup() {
  const key = useChartStore.persist.getOptions().name!;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tradingview-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Replaces the saved state with a backup file. Throws with a user-facing message if it isn't one. */
export async function importBackup(file: File) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("El archivo no es un respaldo válido.");
  }
  const state = (parsed as { state?: Record<string, unknown> } | null)?.state;
  if (!state || !(Array.isArray(state.watchlists) || Array.isArray(state.watchlist))) {
    throw new Error("El archivo no es un respaldo de esta app.");
  }
  localStorage.setItem(useChartStore.persist.getOptions().name!, JSON.stringify(parsed));
  await useChartStore.persist.rehydrate();
}
