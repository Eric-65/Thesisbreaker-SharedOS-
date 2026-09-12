import { NextRequest } from "next/server";

import { manifest } from "@/lib/services/registry";

export const dynamic = "force-dynamic";

/** Canonical discovery URL. Alias of /api/agent/services. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return Response.json(manifest({ publicBaseUrl: `${url.protocol}//${url.host}` }));
}
