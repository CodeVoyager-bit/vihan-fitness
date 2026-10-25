import { audit, backupLines } from "@/lib/db";
import { EXPORT_MONEY, exportRows } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { todayIST } from "@/lib/time";

// Admin-only record exports. CSV starts with a BOM so Excel shows Marathi/Hindi names correctly.
const R = (p: number | null) => (p == null ? "" : (p / 100).toFixed(2));

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const admin = await requireAdmin();
  const { kind } = await params;
  const stamp = todayIST();

  if (kind === "backup") {
    await audit(admin.id, "export.backup");
    // Read from the database at full speed first: the backup's snapshot only lives ~5 minutes, and a slow
    // download must not outlast it. Then streamed, because hosted functions cap buffered responses.
    // (ponytail: holds the backup in memory while sending; fine for a gym's MBs, spool to a file if it nears 1 GB.)
    const lines: string[] = [];
    for await (const line of backupLines()) lines.push(line);
    const enc = new TextEncoder();
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (i < lines.length) ctrl.enqueue(enc.encode(lines[i++]));
        else ctrl.close();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="vihan-fitness-backup-${stamp}.jsonl"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const rows = await exportRows(kind);
  if (!rows) return new Response("Not found", { status: 404 });
  const money = EXPORT_MONEY[kind];
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const lines = [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(money.includes(c) ? R(r[c] as number) : r[c])).join(","))];
  await audit(admin.id, "export.csv", { detail: { kind, rows: rows.length } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vihan-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
