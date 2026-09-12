import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { orders, theses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runRiskGate } from "@/lib/risk";
import { callAgentTool, getAgentConnectionStatus } from "@/lib/binance/agent";
import { logEvent } from "@/lib/monitor";
import type { AnalysisResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/theses/[id]/approve
 *
 * The USER APPROVAL step. The client sends the reviewed proposal + an
 * idempotency key. The server:
 *   1. Re-runs the risk gate (never trusts client-supplied numbers)
 *   2. Refuses if the gate fails
 *   3. Calls Binance Agent OS if connected — otherwise records a
 *      clearly labeled DEMO action (never claimed as a real Binance trade)
 *   4. Persists an order row linked to the thesis
 *   5. Updates thesis status and logs a monitoring event
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const clientRequestKey: string | null =
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey : null;
    const requestedMode: "agent" | "demo" =
      body?.executionMode === "demo" ? "demo" : "agent";

    const [row] = await db.select().from(theses).where(eq(theses.id, id)).limit(1);
    if (!row) return Response.json({ ok: false, error: "not found" }, { status: 404 });

    if (row.assetType !== "CRYPTO") {
      return Response.json(
        {
          ok: false,
          blocked: true,
          reason: `${row.assetType} theses are research-only in this build. Only Binance-listed crypto pairs are routable through Binance Agent OS here.`,
        },
        { status: 400 },
      );
    }

    // Idempotency: same key twice → return existing order
    if (clientRequestKey) {
      const [existing] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.thesisId, id), eq(orders.clientOrderId, clientRequestKey)))
        .limit(1);
      if (existing) {
        return Response.json({ ok: true, mode: existing.mode, data: existing, duplicate: true });
      }
    }

    const agent = await getAgentConnectionStatus();
    if (requestedMode === "agent" && agent.agentConnection !== "CONNECTED") {
      const reasonByState: Record<string, string> = {
        AUTHORIZATION_EXPIRED:
          "Binance Agent OS authorization has expired. Reconnect through the official Agent OS flow to re-enable live actions.",
        ERROR: `Binance Agent OS is currently unreachable${agent.lastError ? ` (${agent.lastError})` : ""}. Refusing to submit a live action.`,
        DEMO:
          "Binance Agent OS is not connected. Configure BINANCE_AGENT_TOKEN and complete the official authorization flow, or explicitly submit executionMode=\"demo\" to record a clearly-labeled demo action.",
        CONNECTING:
          "Binance Agent OS session is still being verified. Try again in a few seconds.",
        AUTHORIZING: "Binance Agent OS authorization is in progress. Try again shortly.",
        RECONNECT_REQUIRED: "Binance Agent OS requires reconnection.",
        DISCONNECTED: "Binance Agent OS is disconnected.",
      };
      return Response.json(
        {
          ok: false,
          blocked: true,
          reason:
            reasonByState[agent.agentConnection] ??
            "Binance Agent OS is not in a CONNECTED state. Refusing to submit a live action.",
          agent: {
            agentConnection: agent.agentConnection,
            trading: agent.trading,
          },
        },
        { status: 400 },
      );
    }

    const analysis = row.analysis as AnalysisResult;
    let gate = await runRiskGate({
      symbol: row.symbol,
      direction: row.direction as "long" | "short",
      positionSizeUsd: Number(row.positionSize),
      verdict: analysis.verdict,
    });

    // In DEMO mode only, allow proceeding when the only failing checks are
    // the market-price/quantity ones. Never fabricate the price.
    if (!gate.ok && requestedMode === "demo") {
      const fails = gate.checks.filter((c) => c.status === "FAIL");
      const onlyPriceOrQty = fails.every(
        (c) => c.key === "market_price" || c.key === "quantity",
      );
      if (onlyPriceOrQty) {
        const demoPrice = 100;
        const qty = Math.max(0.01, Number(row.positionSize) / demoPrice);
        gate = {
          ...gate,
          ok: true,
          blockedReason: undefined,
          estimatedPrice: demoPrice,
          quantity: qty,
          estimatedNotional: qty * demoPrice,
          checks: gate.checks.map((c) =>
            c.key === "market_price"
              ? {
                  ...c,
                  status: "WARN" as const,
                  detail:
                    "No live provider price. Demo path uses a $100 demo price for sizing — never presented as a real Binance market value.",
                }
              : c.key === "quantity"
                ? {
                    ...c,
                    status: "PASS" as const,
                    detail: `${qty.toFixed(4)} units at demo $${demoPrice}.`,
                  }
                : c,
          ),
        };
      }
    }

    if (!gate.ok) {
      return Response.json(
        {
          ok: false,
          blocked: true,
          reason: gate.blockedReason ?? "Risk gate failed.",
          gate,
        },
        { status: 400 },
      );
    }

    const side = row.direction === "long" ? "buy" : "sell";
    const clientOrderId = clientRequestKey ?? `tb_${randomUUID()}`;

    let agentOrderId: string | null = null;
    let status: string;
    let mode: "live" | "demo";
    let orderType = "market";

    if (requestedMode === "agent") {
      // Live path: proxy to Binance Agent OS MCP.
      const result = await callAgentTool<{ orderId?: string; status?: string; type?: string }>(
        "binance.spot.place_order",
        {
          symbol: row.symbol.replace("/", ""),
          side: side.toUpperCase(),
          type: "MARKET",
          quantity: gate.quantity,
          newClientOrderId: clientOrderId,
        },
      );
      if (!result.ok) {
        return Response.json(
          {
            ok: false,
            error: `BINANCE AGENT OS UNAVAILABLE — ${result.error}. Retry, or explicitly submit with executionMode="demo".`,
          },
          { status: 502 },
        );
      }
      if (result.mode === "demo") {
        // Shouldn't happen (we checked above), but guard.
        return Response.json(
          { ok: false, error: "Agent OS returned a demo response unexpectedly." },
          { status: 502 },
        );
      }
      agentOrderId = result.data?.orderId ?? `agent_${randomUUID()}`;
      status = result.data?.status ?? "SUBMITTED";
      mode = "live";
      orderType = result.data?.type ?? "market";
    } else {
      // Explicit demo path
      agentOrderId = `demo_${randomUUID()}`;
      status = "filled";
      mode = "demo";
    }

    const [orderRow] = await db
      .insert(orders)
      .values({
        thesisId: id,
        alpacaOrderId: agentOrderId, // legacy column name; represents agent order id
        clientOrderId,
        symbol: row.symbol,
        side,
        qty: String(gate.quantity),
        orderType,
        status,
        estimatedPrice: String(gate.estimatedPrice),
        estimatedNotional: String(gate.estimatedNotional),
        mode,
      })
      .returning();

    await db
      .update(theses)
      .set({
        status: "APPROVED",
        paperOrderId: agentOrderId ?? orderRow.id,
        updatedAt: new Date(),
      })
      .where(eq(theses.id, id));

    await logEvent(id, {
      kind: "PAPER_ORDER_SUBMITTED",
      message: `${mode === "live" ? "Binance Agent OS" : "Demo"} action submitted: ${side.toUpperCase()} ${gate.quantity.toFixed(6)} ${row.symbol} @ ~${gate.estimatedPrice.toFixed(2)}.`,
      meta: { agentOrderId, clientOrderId, mode },
    });

    if (status === "filled" || status === "FILLED") {
      await logEvent(id, {
        kind: "PAPER_ORDER_FILLED",
        message: `Action filled: ${side.toUpperCase()} ${gate.quantity.toFixed(6)} ${row.symbol}.`,
        meta: { agentOrderId },
      });
    }

    return Response.json({ ok: true, mode, data: orderRow, gate });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
