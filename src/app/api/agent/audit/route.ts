import { desc } from "drizzle-orm";

import { getDb } from "@/db";
import { serviceCalls } from "@/db/schema";
import { recentServiceCalls } from "@/lib/services/call-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/audit
 *
 * Recent Arena service invocations — the USAGE log, for commercial questions
 * (who called what, how long, how many credits). This is not the SharedOS
 * audit trail; for kernel authorization events use /api/arena/audit.
 *
 * Falls back to the in-process log when no database is configured, so the view
 * still works for an Arena deployment running without Postgres.
 */
export async function GET() {
  const database = getDb();

  if (!database) {
    return Response.json({
      ok: true,
      source: "in-memory",
      note: "No DATABASE_URL configured; showing this process's recent calls. Kernel authorization events are at /api/arena/audit.",
      data: recentServiceCalls(100),
    });
  }

  try {
    const rows = await database
      .select()
      .from(serviceCalls)
      .orderBy(desc(serviceCalls.createdAt))
      .limit(100);
    return Response.json({ ok: true, source: "database", data: rows });
  } catch (err) {
    return Response.json({
      ok: true,
      source: "in-memory",
      note: `Database unavailable: ${(err as Error).message.slice(0, 200)}`,
      data: recentServiceCalls(100),
    });
  }
}
