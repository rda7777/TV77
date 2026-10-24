// First Eagle Investment Management's holdings of 0.5% of the portfolio or more that can be bought
// in Argentina as a CEDEAR, in portfolio weight order. Holdings come from its Q2 2026 13F
// (dataroma.com/m/holdings.php?m=FE, portfolio date 30 Jun 2026); CEDEAR availability was checked
// against BYMA quotes in Oct 2026. Each entry carries a short sector/description that is seeded as
// the symbol's watchlist note.
const FIRST_EAGLE_HOLDINGS: [symbol: string, note: string][] = [
  // First Eagle mostly holds class C (GOOG), but the CEDEAR is on class A
  ["GOOGL", "Tecnología — Alphabet (clase A): buscador Google, YouTube, Android y Google Cloud."],
  ["BDX", "Salud — Becton Dickinson: insumos y dispositivos médicos (jeringas, agujas, diagnóstico)."],
  ["META", "Tecnología — Meta: Facebook, Instagram y WhatsApp; vive de la publicidad digital."],
  ["TSM", "Semiconductores — TSMC: mayor fabricante de chips por contrato del mundo (Taiwán)."],
  ["FMX", "Consumo — FEMSA: tiendas OXXO y embotellador de Coca-Cola (México)."],
  ["SLB", "Energía — Schlumberger: mayor empresa de servicios petroleros del mundo."],
  ["BNY", "Financiero — Bank of New York Mellon: banco de custodia y servicios de activos."],
  ["ORCL", "Tecnología — Oracle: bases de datos, software empresarial e infraestructura en la nube."],
  ["ADP", "Servicios — ADP: liquidación de sueldos y RR.HH. tercerizados."],
  ["CRM", "Software — Salesforce: CRM en la nube."],
  ["ABEV", "Consumo — Ambev: cervecera brasileña (Brahma, Skol), filial de AB InBev."],
  ["MDT", "Salud — Medtronic: dispositivos médicos (marcapasos, bombas de insulina, cirugía)."],
  ["NEM", "Minería — Newmont: mayor productora de oro del mundo."],
  ["PM", "Consumo — Philip Morris Intl.: tabaco (Marlboro fuera de EE.UU.), IQOS y Zyn."],
  ["GLD", "ETF — SPDR Gold Trust: replica el precio del oro físico."],
  ["BKNG", "Consumo discrecional — Booking Holdings: reservas de viajes online (Booking.com, Priceline, Kayak)."],
  ["XOM", "Energía — ExxonMobil: mayor petrolera integrada de EE.UU."],
  ["AEM", "Minería — Agnico Eagle: productora de oro canadiense."],
  ["CL", "Consumo básico — Colgate-Palmolive: higiene bucal y personal, alimento para mascotas (Hill's)."],
  ["IFF", "Materiales — IFF: sabores, fragancias e ingredientes."],
  ["B", "Minería — Barrick: oro y cobre."],
  ["MSFT", "Tecnología — Microsoft: Windows, Office, nube Azure e IA."],
  ["AXP", "Financiero — American Express: tarjetas de crédito y pagos."],
  ["USB", "Financiero — U.S. Bancorp: banco comercial."],
  ["FISV", "Fintech — Fiserv: procesamiento de pagos y tecnología bancaria (Clover)."],
  ["DIS", "Comunicaciones — Disney: parques, cine, streaming (Disney+) y ESPN."],
  // First Eagle mostly holds class A, but the CEDEAR is on class B (Yahoo's ticker is BRK-B)
  ["BRK-B", "Financiero — Berkshire Hathaway (clase B): holding de Warren Buffett (seguros, ferrocarril, energía)."],
  ["DE", "Industrial — Deere: maquinaria agrícola y de construcción (John Deere)."],
];

export const FIRST_EAGLE_SECTION_ID = "first-eagle";
export const FIRST_EAGLE_SECTION_NAME = "First Eagle (CEDEAR)";
export const FIRST_EAGLE_SYMBOLS = FIRST_EAGLE_HOLDINGS.map(([symbol]) => symbol);
export const FIRST_EAGLE_NOTES: Record<string, string> = Object.fromEntries(FIRST_EAGLE_HOLDINGS);

/** Section name seeded by store v2, before the list was narrowed to CEDEARs */
export const FIRST_EAGLE_LEGACY_SECTION_NAME = "First Eagle";
/** Symbols store v2 seeded into the section that have no CEDEAR (or whose CEDEAR is on another share class) */
export const FIRST_EAGLE_LEGACY_SYMBOLS = [
  "GOOG", "ELV", "WPM", "IMO", "HCA", "WY", "WTW", "FNV", "WDAY", "OKE", "CMCSA", "PPG", "BIO",
  "BRO", "CHRW", "UHS", "VMRK", "BXP", "NTR", "NOV", "EXR", "OMC", "NE", "DG", "CHTR", "WAT",
  "CSL", "CFR", "BRK-A", "FNF", "MICC", "IPGP", "CMI", "EXPD", "HCC",
];
