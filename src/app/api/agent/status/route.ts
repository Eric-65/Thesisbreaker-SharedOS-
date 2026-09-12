import { NextRequest } from "next/server";
import { getAgentConnectionStatus } from "@/lib/binance/agent";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const status = await getAgentConnectionStatus({ force });
  return Response.json({ ok: true, data: status });
}
