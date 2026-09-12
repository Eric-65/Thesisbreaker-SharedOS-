import { NextRequest } from "next/server";

import { recentAuditEvents } from "@/lib/sharedos/adapter";

export const dynamic = "force-dynamic";

/**
 * GET /api/arena/audit
 *
 * Recent SharedOS kernel audit events, exactly as the kernel emitted them.
 * This is a read-only view of the real trail — nothing here is synthesized.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const traceId = url.searchParams.get("trace_id");

  const events = recentAuditEvents(200);
  const filtered = traceId ? events.filter((e) => e.traceId === traceId) : events;

  return Response.json({
    source: "@aicoo/sharedos-core kernel audit sink",
    note: "These events are emitted by the SharedOS kernel itself, not by ThesisBreaker.",
    count: filtered.length,
    events: filtered.slice(0, limit),
  });
}
