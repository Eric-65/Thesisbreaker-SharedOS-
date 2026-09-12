import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getService, PURPOSE } from "@/lib/services/registry";
import {
  BREAK_THESIS_REQUIRED_CAPABILITIES,
  runBreakThesisService,
  validateBreakThesisRequest,
} from "@/lib/services/break_thesis";
import {
  VERIFY_CLAIM_REQUIRED_CAPABILITIES,
  runVerifyClaimService,
  validateVerifyClaimRequest,
} from "@/lib/services/verify_claim";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/services/[name]
 *
 * Executes an Arena service as a SharedOS-style agent turn. Machine-facing;
 * accepts JSON, returns JSON. No browser session required.
 *
 * Recognised headers:
 *   x-purpose               — required, must match the service purpose
 *   x-granted-capabilities  — comma-separated capability strings
 *   x-caller-agent-id       — optional caller identifier
 *   x-caller-name           — optional display name
 *   x-request-id            — optional idempotency key
 *
 * If any header is missing, sensible defaults let a human tester call the
 * endpoint with curl / Postman; production agent callers should always
 * include the purpose + grants.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const spec = getService(name);
  if (!spec) {
    return Response.json({ ok: false, error: `unknown service: ${name}` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const requestId = req.headers.get("x-request-id") ?? `req_${randomUUID()}`;
  const purpose = req.headers.get("x-purpose") ?? PURPOSE;
  const grantedRaw = req.headers.get("x-granted-capabilities") ?? "";
  const declaredGrants = grantedRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const grantedCapabilities =
    declaredGrants.length > 0
      ? declaredGrants
      : // Sensible default for a human tester: grant EXACTLY the minimum
        // required for the requested service. Never grant more.
        (name === "break_thesis"
          ? BREAK_THESIS_REQUIRED_CAPABILITIES
          : VERIFY_CLAIM_REQUIRED_CAPABILITIES);
  const callerAgentId = req.headers.get("x-caller-agent-id") ?? undefined;
  const callerName = req.headers.get("x-caller-name") ?? undefined;
  const grants = {
    purpose,
    service: spec.name,
    grantedCapabilities,
    callerAgentId,
    callerName,
    requestId,
  } as const;

  if (name === "break_thesis") {
    const v = validateBreakThesisRequest(body);
    if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
    const out = await runBreakThesisService(v.value, grants);
    return Response.json(out, { status: out.ok ? 200 : out.denied ? 403 : 500 });
  }
  if (name === "verify_claim") {
    const v = validateVerifyClaimRequest(body);
    if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
    const out = await runVerifyClaimService(v.value, grants);
    return Response.json(out, { status: out.ok ? 200 : out.denied ? 403 : 500 });
  }
  return Response.json({ ok: false, error: `unhandled service: ${name}` }, { status: 404 });
}
