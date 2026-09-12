export const dynamic = "force-dynamic";

/**
 * Market clock. Crypto markets on Binance run 24/7, so we always report
 * OPEN unless we have a positive signal that Binance itself is degraded.
 * We do NOT invent a "market closed" state.
 */
export async function GET() {
  return Response.json({
    ok: true,
    data: {
      isOpen: true,
      session: "OPEN_24_7",
      source: "BINANCE",
      timestamp: new Date().toISOString(),
    },
  });
}
