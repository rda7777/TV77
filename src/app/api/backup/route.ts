import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Automatic backups land in <project>/backups, one file per day. They're the same blob the
// watchlist menu exports, so "Importar respaldo" restores any of them.
const BACKUP_DIR = path.join(process.cwd(), "backups");
const KEEP_DAYS = 30;
const MAX_BYTES = 5 * 1024 * 1024;
const FILE_RE = /^tradingview-respaldo-\d{4}-\d{2}-\d{2}\.json$/;

function localDate() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function POST(req: NextRequest) {
  // Only the copy running on this PC writes to its disk; the online version has no disk to keep
  const host = req.nextUrl.hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    return NextResponse.json({ error: "solo disponible en localhost" }, { status: 403 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "respaldo demasiado grande" }, { status: 413 });
  }
  let parsed: { state?: Record<string, unknown> } | null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!parsed?.state || !Array.isArray(parsed.state.watchlists)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  await mkdir(BACKUP_DIR, { recursive: true });
  const file = `tradingview-respaldo-${localDate()}.json`;
  await writeFile(path.join(BACKUP_DIR, file), raw, "utf8");

  const old = (await readdir(BACKUP_DIR)).filter((f) => FILE_RE.test(f)).sort().slice(0, -KEEP_DAYS);
  await Promise.all(old.map((f) => unlink(path.join(BACKUP_DIR, f))));

  return NextResponse.json({ file });
}
