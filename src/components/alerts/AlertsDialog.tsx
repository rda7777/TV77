"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAlertsStore, type AlertCondition } from "@/lib/store/alerts-store";
import { useChartStore } from "@/lib/store/chart-store";
import { formatPrice } from "@/lib/format";

export function AlertsDialog() {
  const open = useAlertsStore((s) => s.dialogOpen);
  const setOpen = useAlertsStore((s) => s.setDialogOpen);
  const alerts = useAlertsStore((s) => s.alerts);
  const addAlert = useAlertsStore((s) => s.addAlert);
  const removeAlert = useAlertsStore((s) => s.removeAlert);
  const currentSymbol = useChartStore((s) => s.symbol);

  const [symbol, setSymbol] = useState(currentSymbol);
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const price = parseFloat(targetPrice);
    if (!symbol.trim()) return setError("Ingresá un símbolo.");
    if (isNaN(price) || price <= 0) return setError("Precio inválido.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Email inválido.");

    addAlert({ symbol: symbol.trim().toUpperCase(), condition, targetPrice: price, email: email.trim() });
    setTargetPrice("");
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Alertas de precio</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Símbolo (ej. BTCUSDT)"
              className="bg-tv-bg uppercase"
            />
            <Select value={condition} onValueChange={(v) => setCondition(v as AlertCondition)}>
              <SelectTrigger className="bg-tv-bg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="above">Sube por encima de</SelectItem>
                <SelectItem value="below">Baja por debajo de</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="Precio objetivo"
            className="bg-tv-bg tabular-nums"
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="bg-tv-bg"
          />
          {error && <p className="text-xs text-tv-red">{error}</p>}
          <Button size="sm" onClick={submit} className="bg-tv-blue hover:bg-tv-blue/90">
            Crear alerta
          </Button>

          {alerts.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 border-t border-tv-border pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                Tus alertas
              </span>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-tv-panel-hover"
                  >
                    <div className="flex flex-col">
                      <span className="text-tv-text">
                        {a.symbol} {a.condition === "above" ? "≥" : "≤"} {formatPrice(a.targetPrice)}
                      </span>
                      <span className="text-[10px] text-tv-text-muted">
                        {a.email}
                        {a.triggeredAt ? " · disparada" : ""}
                      </span>
                    </div>
                    <button
                      onClick={() => removeAlert(a.id)}
                      className="rounded p-1 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red"
                      aria-label={`Eliminar alerta de ${a.symbol}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
