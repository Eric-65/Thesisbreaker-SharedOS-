import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Process liveness. The database is optional — the Arena services do not need
 * one — so a missing or unreachable database is reported, not treated as the
 * application being down. For Arena readiness use /api/arena/health.
 */
export async function GET() {
  const database = getDb();

  if (!database) {
    return Response.json({ ok: true, database: "not_configured" });
  }

  try {
    await database.execute(sql`select 1`);
    return Response.json({ ok: true, database: "connected" });
  } catch (err) {
    // The app is still serving; only the optional database is unavailable.
    return Response.json({
      ok: true,
      database: "unreachable",
      detail: (err as Error).message.slice(0, 200),
    });
  }
}
