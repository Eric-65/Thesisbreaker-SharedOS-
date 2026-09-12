import { NextRequest } from "next/server";
import { manifest } from "@/lib/services/registry";
import { getSharedOsStatus } from "@/lib/sharedos/adapter";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/services
 *
 * Machine-readable service catalog. Suitable for SharedNet discovery.
 * The response contains input/output JSON schemas, per-service prices,
 * expected latency, purpose string, and permission surface.
 */
export async function GET(req: NextRequest) {
  const status = await getSharedOsStatus();
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return Response.json({
    ok: true,
    data: {
      ...manifest(baseUrl),
      sharedos: {
        state: status.state,
        executionMode: status.executionMode,
        policy: status.policy,
        purpose: status.purpose,
        nodeId: status.nodeId,
        cloudEndpoint: status.cloudEndpoint,
      },
    },
  });
}
