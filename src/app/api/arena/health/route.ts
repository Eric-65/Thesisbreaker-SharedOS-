import { checkArenaHealth } from "@/lib/arena/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/arena/health
 *
 * Arena readiness. Never contains a credential value — only whether a required
 * variable is present.
 */
export async function GET() {
  const health = await checkArenaHealth();
  const httpStatus = health.status === "down" ? 503 : 200;
  return Response.json(health, { status: httpStatus });
}
