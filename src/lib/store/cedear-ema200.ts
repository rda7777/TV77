// The daily EMA200 bounces ("Rebote", marco "Diario") of the Escáner de CEDEARs dashboard
// (claude.ai/artifact/4nZ7bkB7smHRmueRfQz2kv) as of the 23 Oct 2026 close: CEDEARs that touched
// the EMA200 from above in the last 20 sessions and now close above it, most recent contact first.
// Symbols are Yahoo tickers (the CEDEARs KOFM, BRKB and DISN trade as KOF, BRK-B and DIS). Each
// entry carries a short sector/description that is seeded as the symbol's watchlist note when it
// has none (symbols without one already have a note elsewhere).
const CEDEAR_EMA200_BOUNCES: [symbol: string, note?: string][] = [
  ["TEM", "Salud — Tempus AI: diagnóstico genómico y análisis de datos clínicos con IA."],
  ["MMM", "Industrial — 3M: conglomerado de materiales, adhesivos, seguridad y productos de consumo."],
  ["PATH", "Software — UiPath: automatización robótica de procesos (RPA) e IA para empresas."],
  ["BMY", "Salud — Bristol-Myers Squibb: farmacéutica; oncología, inmunología y cardiología."],
  ["BNY"],
  ["USB"],
  ["AKO-B", "Consumo — Embotelladora Andina: embotellador de Coca-Cola en Chile, Brasil, Argentina y Paraguay."],
  ["AVY", "Materiales — Avery Dennison: etiquetas, adhesivos y etiquetas inteligentes RFID."],
  ["SYY", "Consumo básico — Sysco: mayor distribuidor de alimentos para restaurantes de EE.UU."],
  ["CVS", "Salud — CVS Health: farmacias, seguro médico (Aetna) y gestión de recetas."],
  ["VRTX"],
  ["UL", "Consumo básico — Unilever: alimentos, higiene y cuidado personal (Dove, Knorr, Rexona)."],
  ["UNH", "Salud — UnitedHealth: mayor aseguradora médica de EE.UU. y servicios de salud (Optum)."],
  ["MSI", "Tecnología — Motorola Solutions: radios y sistemas de comunicación para seguridad pública."],
  ["MDLZ", "Consumo básico — Mondelez: galletitas y golosinas (Oreo, Milka, Cadbury, Toblerone)."],
  ["MDT"],
  ["DIS"],
  ["SONY", "Tecnología — Sony: PlayStation, sensores de imagen, música y cine (Japón)."],
  ["XYZ", "Fintech — Block: pagos para comercios (Square) y billetera digital (Cash App)."],
  ["FMX"],
  ["VIST", "Energía — Vista Energy: petróleo y gas no convencional en Vaca Muerta."],
  ["MO"],
  ["BRK-B"],
  ["ECL", "Materiales — Ecolab: productos y servicios de higiene, limpieza y tratamiento de agua."],
  ["KOF", "Consumo — Coca-Cola FEMSA: mayor embotellador de Coca-Cola del mundo (México y Latinoamérica)."],
  ["HOG", "Consumo discrecional — Harley-Davidson: motos de alta cilindrada y financiamiento."],
  ["ABEV"],
  ["MA"],
  ["UNP", "Industrial — Union Pacific: mayor red ferroviaria de carga del oeste de EE.UU."],
  ["ETSY", "Consumo discrecional — Etsy: marketplace online de productos artesanales y vintage."],
  ["CAH", "Salud — Cardinal Health: distribución de medicamentos e insumos médicos en EE.UU."],
  ["VRSN", "Tecnología — VeriSign: registro de dominios .com y .net e infraestructura de DNS."],
  ["NOW", "Software — ServiceNow: plataforma en la nube para automatizar flujos de trabajo de empresas."],
];

export const CEDEAR_EMA200_SECTION_ID = "cedear-ema200-rebote";
export const CEDEAR_EMA200_SECTION_NAME = "Rebote EMA200 diaria (CEDEAR)";
export const CEDEAR_EMA200_SYMBOLS = CEDEAR_EMA200_BOUNCES.map(([symbol]) => symbol);
export const CEDEAR_EMA200_NOTES: Record<string, string> = Object.fromEntries(
  CEDEAR_EMA200_BOUNCES.filter((e): e is [string, string] => !!e[1]),
);
