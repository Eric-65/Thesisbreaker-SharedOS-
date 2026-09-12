import { db } from "@/db";
import { theses } from "@/db/schema";
import { runPipeline } from "@/lib/agents/pipeline";
import { logEvent } from "@/lib/monitor";

export const dynamic = "force-dynamic";

const DEMO = {
  symbol: "BTC/USDT",
  assetType: "CRYPTO" as const,
  direction: "long" as const,
  timeHorizon: "1–2W",
  positionSize: "500",
  riskTolerance: "moderate",
  originalText:
    "I think BTC will break resistance and continue higher because momentum is building and 24h volume has been increasing, with spot demand returning after the recent range consolidation.",
  catalysts: "Range-high retest, funding reset, spot volume uptick",
  expectedOutcome: "5–10% upside over 1–2 weeks",
};

/**
 * POST /api/theses/demo
 *
 * One-click seed: creates the flagship BTC/USDT "breakout" demo thesis so a
 * judge can experience the full ThesisBreaker × Binance Agent OS flow in
 * seconds without typing anything or connecting a Binance account.
 */
export async function POST() {
  try {
    const analysis = await runPipeline(DEMO);
    const [row] = await db
      .insert(theses)
      .values({
        symbol: DEMO.symbol,
        assetType: DEMO.assetType,
        direction: DEMO.direction,
        timeHorizon: DEMO.timeHorizon,
        positionSize: DEMO.positionSize,
        riskTolerance: DEMO.riskTolerance,
        originalText: DEMO.originalText,
        catalysts: DEMO.catalysts,
        expectedOutcome: DEMO.expectedOutcome,
        originalAnalysis: analysis,
        originalExtraction: analysis.extraction,
        initialScore: analysis.score,
        analysis,
        currentScore: analysis.score,
        status:
          analysis.verdict.status === "TRADE"
            ? "TRADE_READY"
            : analysis.verdict.status === "NO_TRADE" || analysis.verdict.status === "INVALIDATED"
              ? "INVALIDATED"
              : "WAIT",
      })
      .returning();
    await logEvent(row.id, {
      kind: "THESIS_CREATED",
      message: `Demo thesis created for judge walkthrough. Initial score ${analysis.score}/100.`,
      scoreAfter: analysis.score,
    });
    return Response.json({ ok: true, data: row });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
