"use client";

import { useEffect, useMemo } from "react";
import { getBinanceWS } from "@/lib/binance/ws";
import { fetchStockQuotes } from "@/lib/stocks/rest";
import { getMarketType } from "@/lib/market";
import { useAlertsStore } from "@/lib/store/alerts-store";

const STOCK_POLL_MS = 15000;

/**
 * Mounted once near the app root. Watches live prices for every symbol with a
 * pending alert and fires the notify API the instant a condition is met —
 * alerts only work while this tab stays open (no server-side cron).
 */
export function AlertsWatcher() {
  const alerts = useAlertsStore((s) => s.alerts);
  const markTriggered = useAlertsStore((s) => s.markTriggered);

  const pending = useMemo(() => alerts.filter((a) => !a.triggeredAt), [alerts]);
  const symbolsKey = useMemo(
    () => Array.from(new Set(pending.map((a) => a.symbol))).sort().join(","),
    [pending],
  );

  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split(",");
    let cancelled = false;

    function checkPrice(sym: string, price: number) {
      const state = useAlertsStore.getState();
      state.alerts
        .filter((a) => a.symbol === sym && !a.triggeredAt)
        .forEach((a) => {
          const hit =
            a.condition === "above" ? price >= a.targetPrice : price <= a.targetPrice;
          if (!hit) return;
          markTriggered(a.id);
          fetch("/api/alerts/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: a.email,
              symbol: a.symbol,
              condition: a.condition,
              targetPrice: a.targetPrice,
              currentPrice: price,
            }),
          }).catch(console.error);
        });
    }

    const cryptoSymbols = symbols.filter((s) => getMarketType(s) === "crypto");
    const stockSymbols = symbols.filter((s) => getMarketType(s) === "stock");

    let unsubWs: (() => void) | null = null;
    let stockPollTimer: ReturnType<typeof setInterval> | null = null;

    if (cryptoSymbols.length > 0) {
      const ws = getBinanceWS();
      unsubWs = ws.subscribeMiniTickers(cryptoSymbols, (tick) => {
        checkPrice(tick.symbol, tick.close);
      });
    }

    if (stockSymbols.length > 0) {
      const pollStocks = () => {
        fetchStockQuotes(stockSymbols)
          .then((quotes) => {
            if (cancelled) return;
            quotes.forEach((q) => checkPrice(q.symbol, q.lastPrice));
          })
          .catch(console.error);
      };
      pollStocks();
      stockPollTimer = setInterval(pollStocks, STOCK_POLL_MS);
    }

    return () => {
      cancelled = true;
      if (unsubWs) unsubWs();
      if (stockPollTimer) clearInterval(stockPollTimer);
    };
  }, [symbolsKey, markTriggered]);

  return null;
}
