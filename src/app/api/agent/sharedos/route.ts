import { getSharedOsStatus } from "@/lib/sharedos/adapter";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getSharedOsStatus();
  return Response.json({ ok: true, data: status });
}
