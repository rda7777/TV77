import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

interface NotifyBody {
  email: string;
  symbol: string;
  condition: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY no está configurada en el servidor" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as Partial<NotifyBody>;
  const { email, symbol, condition, targetPrice, currentPrice } = body;
  if (!email || !symbol || !condition || typeof targetPrice !== "number" || typeof currentPrice !== "number") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const direction = condition === "above" ? "subió por encima de" : "bajó por debajo de";
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.ALERTS_FROM_EMAIL ?? "TradingView Gratis <onboarding@resend.dev>",
    to: email,
    subject: `${symbol} ${direction} ${targetPrice}`,
    html: `
      <div style="font-family: sans-serif; padding: 16px;">
        <h2 style="margin: 0 0 8px;">Alerta de precio: ${symbol}</h2>
        <p style="margin: 0 0 4px;">El precio ${direction} <strong>${targetPrice}</strong>.</p>
        <p style="margin: 0; color: #787b86;">Precio actual: ${currentPrice}</p>
      </div>
    `,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
