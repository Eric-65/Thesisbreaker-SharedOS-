import { NextRequest } from "next/server";
import { db } from "@/db";
import { theses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runRiskGate } from "@/lib/risk";
import { getAgentConnectionStatus } from "@/lib/binance/agent";
import type { AnalysisResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/theses/[id]/proposal
 *
 * Builds an Execution Proposal for a thesis: symbol, side, size,
 * estimated entry from a fresh Binance quote, stop/target derived from
 * risk config, plus the deterministic risk-gate readout. No order is
 * placed — this is a preview for the user's REVIEW ACTION step.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.select().from(theses).where(eq(theses.id, id)).limit(1);
    if (!row) return Response.json({ ok: false, error: "not found" }, { status: 404 });

    if (row.assetType === "NFT_COLLECTION") {
      return Response.json(
        {
          ok: false,
          blocked: true,
          reason:
            "NFT collections are research-only. ThesisBreaker does not propose Binance Agent OS actions for NFT collections.",
        },
        { status: 400 },
      );
    }

    const analysis = row.analysis as AnalysisResult;
    const gate = await runRiskGate({
      symbol: row.symbol,
      direction: row.direction as "long" | "short",
      positionSizeUsd: Number(row.positionSize),
      verdict: analysis.verdict,
    });

    // Simple stop/target using ATR-ish proxy from bars would be ideal but we
    // keep this deterministic and conservative: 2% stop, 3% target for long.
    const entry = gate.estimatedPrice;
    const stopPct = 0.02;
    const targetPct = 0.03;
    const stop = row.direction === "long" ? entry * (1 - stopPct) : entry * (1 + stopPct);
    const target = row.direction === "long" ? entry * (1 + targetPct) : entry * (1 - targetPct);
    const risk = Math.abs(entry - stop) * gate.quantity;
    const reward = Math.abs(entry - target) * gate.quantity;
    const rr = risk > 0 ? reward / risk : 0;

    const agent = getAgentConnectionStatus();

    return Response.json({
      ok: true,
      data: {
        thesis: {
          id: row.id,
          symbol: row.symbol,
          direction: row.direction,
          score: row.currentScore,
          verdict: analysis.verdict,
          positionSize: row.positionSize,
        },
        proposal: entry > 0
          ? {
              symbol: row.symbol,
              side: row.direction === "long" ? "BUY" : "SELL",
              entry,
              stop,
              target,
              size: gate.quantity,
              notional: gate.estimatedNotional,
              risk,
              reward,
              rewardToRisk: rr,
              currency: row.assetType === "CRYPTO" ? "USDT" : "USD",
              venue: "Binance Spot (via Agent OS)",
            }
          : null,
        gate,
        agent,
      },
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
