// The "Ranking de oportunidades · top 30" of the Escáner de CEDEARs dashboard
// (claude.ai/artifact/4nZ7bkB7smHRmueRfQz2kv) as of the 23 Oct 2026 close: CEDEARs in an uptrend
// and not volatile, in score order. Symbols are Yahoo tickers (Tenaris's CEDEAR is TEN, but the
// underlying trades as TS). Each entry carries a short sector/description that is seeded as the
// symbol's watchlist note when it has none (symbols without one already have a note elsewhere).
const CEDEAR_TOP30: [symbol: string, note?: string][] = [
  ["NUE", "Materiales — Nucor: mayor siderúrgica de EE.UU., acero reciclado en hornos eléctricos."],
  ["DE"],
  ["PBI", "Industrial — Pitney Bowes: franqueo, envíos y logística de correo para empresas."],
  ["MSFT"],
  ["AMGN", "Salud — Amgen: biotecnológica; medicamentos para huesos, colesterol, oncología y obesidad."],
  ["PBR", "Energía — Petrobras: petrolera estatal brasileña, fuerte en aguas profundas (presal)."],
  ["JOYY", "Comunicaciones — JOYY: plataformas de video en vivo y redes sociales fuera de China (Bigo Live)."],
  ["ABEV"],
  ["TS", "Energía — Tenaris: tubos de acero sin costura para la industria petrolera (Grupo Techint)."],
  ["EBAY", "Consumo discrecional — eBay: marketplace online de subastas y venta directa."],
  ["GGB", "Materiales — Gerdau: siderúrgica brasileña, acero largo y aceros especiales."],
  ["ADI", "Semiconductores — Analog Devices: chips analógicos y de señal mixta para industria y autos."],
  ["GRMN", "Tecnología — Garmin: GPS, relojes deportivos y electrónica para aviación y náutica."],
  ["ITUB", "Financiero — Itaú Unibanco: mayor banco privado de Brasil."],
  ["ROKU", "Comunicaciones — Roku: plataforma de streaming para TV; vive de la publicidad."],
  ["AAPL"],
  ["UGP", "Energía — Ultrapar: distribución de combustibles (Ipiranga) y gas licuado en Brasil."],
  ["GILD", "Salud — Gilead: biotecnológica; antivirales para VIH y hepatitis, oncología."],
  ["ELPC", "Servicios públicos — Copel: generación y distribución eléctrica en Paraná (Brasil)."],
  ["PSX", "Energía — Phillips 66: refinación, midstream y químicos en EE.UU."],
  ["GPRK", "Energía — GeoPark: exploración y producción de petróleo en Colombia y Latinoamérica."],
  ["MO", "Consumo básico — Altria: tabaco en EE.UU. (Marlboro) y productos sin humo."],
  ["SWKS", "Semiconductores — Skyworks: chips de radiofrecuencia para celulares (gran cliente: Apple)."],
  ["VRTX", "Salud — Vertex: biotecnológica líder en fibrosis quística; dolor y enfermedades renales."],
  ["SHEL", "Energía — Shell: petrolera integrada europea, líder en gas natural licuado."],
  ["FMX"],
  ["BNY"],
  ["XOM"],
  ["HMC", "Consumo discrecional — Honda: autos, motos y motores (Japón)."],
  ["TGT", "Consumo básico — Target: cadena de tiendas de descuento en EE.UU."],
];

export const CEDEAR_TOP30_SECTION_ID = "cedear-top30";
export const CEDEAR_TOP30_SECTION_NAME = "Top 30 escáner CEDEAR";
export const CEDEAR_TOP30_SYMBOLS = CEDEAR_TOP30.map(([symbol]) => symbol);
export const CEDEAR_TOP30_NOTES: Record<string, string> = Object.fromEntries(
  CEDEAR_TOP30.filter((e): e is [string, string] => !!e[1]),
);
