import { db } from "@/db";
import { serviceCalls } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/audit
 *
 * Returns the most recent Arena service invocations. Redacts nothing —
 * the audit trail is the point of the endpoint — but never contains
 * chain-of-thought because the pipeline never produces any.
 */
export async function GET() {
  try {
    const rows = await db
      .select()
      .from(serviceCalls)
      .orderBy(desc(serviceCalls.createdAt))
      .limit(100);
    return Response.json({ ok: true, data: rows });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
