import { NextRequest } from "next/server";

import { manifest, shortManifest } from "@/lib/services/registry";
import { getSharedOsStatus } from "@/lib/sharedos/adapter";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/services
 *
 * Full machine-readable catalogue for SharedNet discovery: prices, input and
 * output JSON Schemas, expected latency, purpose string and how to call each
 * service over MCP, CLI or HTTP.
 *
 * `?short=1` returns the minimal summary an agent needs to decide whether to
 * look further.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("short") === "1") {
    return Response.json(shortManifest());
  }

  const status = await getSharedOsStatus();
  return Response.json({
    ...manifest({ publicBaseUrl: `${url.protocol}//${url.host}` }),
    sharedos: {
      kernel: status.kernel.state,
      policy: status.kernel.policy,
      purpose: status.purpose,
      registration: status.registration.state,
    },
  });
}
