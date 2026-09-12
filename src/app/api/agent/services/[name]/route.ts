import { NextRequest } from "next/server";

import { SERVICE_NAMES, type ServiceName } from "@/lib/arena/config";
import { invokeService } from "@/lib/services/invoke";
import { getService } from "@/lib/services/registry";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/services/[name]
 *
 * Machine-facing service endpoint. JSON in, JSON out, no browser session.
 *
 * Authority is NOT accepted from the request. The caller identifies itself
 * (`x-caller-agent-id`) and SharedOS decides what that caller may invoke by
 * loading grants from the trusted grant source. A caller cannot widen its own
 * permissions by sending a header.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;

  if (!SERVICE_NAMES.includes(name as ServiceName) || !getService(name)) {
    return Response.json(
      {
        success: false,
        error: {
          code: "unknown_service",
          message: `unknown service: ${name}`,
        },
        available: SERVICE_NAMES,
      },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "invalid_payload", message: "invalid JSON body" } },
      { status: 400 },
    );
  }

  const envelope = await invokeService(name as ServiceName, body, {
    caller: {
      agentId: req.headers.get("x-caller-agent-id")?.trim() || "anonymous-http-caller",
      ...(req.headers.get("x-caller-name")?.trim()
        ? { name: req.headers.get("x-caller-name")!.trim() }
        : {}),
    },
    ...(req.headers.get("x-request-id")?.trim()
      ? { requestId: req.headers.get("x-request-id")!.trim() }
      : {}),
  });

  const status = envelope.success
    ? 200
    : envelope.error.code === "unauthorized"
      ? 403
      : envelope.error.code === "timeout"
        ? 504
        : envelope.error.code === "internal_error"
          ? 500
          : 400;

  return Response.json(envelope, { status });
}

/** GET returns the service's contract, so an agent can discover it in one call. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const spec = getService(name);
  if (!spec) {
    return Response.json(
      { success: false, error: { code: "unknown_service", message: `unknown service: ${name}` } },
      { status: 404 },
    );
  }
  return Response.json({
    name: spec.name,
    summary: spec.summary,
    description: spec.agentDescription,
    use_when: spec.useWhen,
    price: spec.priceCredits,
    currency: spec.currency,
    input_schema: spec.request,
    output_schema: spec.response,
    example: spec.example,
    expected_latency_ms: spec.expectedLatencyMs,
  });
}
