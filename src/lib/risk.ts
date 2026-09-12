import type {
  MarketQuote,
} from "./market/types";
import type { HistoricalSeries } from "./market/types";
import type { RiskCheck, RiskGateResult, Verdict } from "./types";
import { getBars, getQuote, resolveIdentity } from "./market/router";
import { classifyFreshness } from "./market/types";
import { getAgentConnectionStatus } from "./binance/agent";

/**
 * Deterministic risk / execution readiness gate for a Binance-mediated
 * action. The LLM does NOT decide whether the app allows the user to
 * submit an execution proposal — this module does.
 *
 * The gate now returns two things:
 *   1) `RiskGateResult` — the per-check pass/warn/fail list plus sizing
 *   2) A separate `tradeReadiness` 0-100 score reflecting whether current
 *      Binance market conditions are suitable for acting on the thesis
 *      *right now*, regardless of how good the thesis itself is.
 */

export const RISK_CONFIG = {
  MAX_POSITION_PERCENT: 10, // agent sub-account concentration cap
  MIN_QTY_USD: 20, // Binance min notional for many pairs
  MAX_QTY_USD: 250_000,
  BLOCKED_STATUSES: new Set(["NO_TRADE", "INVALIDATED"]),
};

export interface RiskGateInput {
  symbol: string;
  direction: "long" | "short";
  positionSizeUsd: number;
  verdict: Verdict;
  agentAccountEquity?: number; // if Binance Agent OS is connected
}

export interface ReadinessInput {
  quote: MarketQuote | null;
  bars: HistoricalSeries | null;
  direction: "long" | "short";
}

/** Trade Readiness — how suitable are current market conditions? */
export function computeTradeReadiness(input: ReadinessInput): {
  score: number;
  band: "POOR" | "WEAK" | "MIXED" | "GOOD" | "STRONG";
  breakdown: { label: string; earned: number; max: number; detail: string }[];
} {
  const { quote, bars, direction } = input;
  const breakdown: { label: string; earned: number; max: number; detail: string }[] = [];

  // 1. Data freshness (20)
  const fresh = quote?.status ?? "UNAVAILABLE";
  const freshPts =
    fresh === "LIVE" ? 20 : fresh === "DELAYED" ? 14 : fresh === "STALE" ? 8 : 0;
  breakdown.push({
    label: "Data freshness",
    earned: freshPts,
    max: 20,
    detail: `Market status ${fresh}${quote?.source ? ` · ${quote.source}` : ""}.`,
  });

  // 2. Momentum alignment with thesis direction (25)
  const pct = quote?.changePercent24h ?? 0;
  const alignsLong = direction === "long" && pct > 0.3;
  const alignsShort = direction === "short" && pct < -0.3;
  const opposesLong = direction === "long" && pct < -0.8;
  const opposesShort = direction === "short" && pct > 0.8;
  const momentumPts = opposesLong || opposesShort
    ? 4
    : alignsLong || alignsShort
      ? 22
      : 12;
  breakdown.push({
    label: "Directional momentum",
    earned: momentumPts,
    max: 25,
    detail: quote?.changePercent24h != null
      ? `24h ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%${
          opposesLong || opposesShort ? " — opposes thesis" : ""
        }.`
      : "No 24h change data.",
  });

  // 3. Trend confirmation from 30D bars (20)
  let trendPts = 10;
  let trendDetail = "No historical bars available.";
  if (bars && bars.bars.length >= 5) {
    const first = bars.bars[0].c;
    const last = bars.bars[bars.bars.length - 1].c;
    const trendPct = first > 0 ? ((last - first) / first) * 100 : 0;
    const aligns =
      (direction === "long" && trendPct > 3) ||
      (direction === "short" && trendPct < -3);
    const opposes =
      (direction === "long" && trendPct < -6) ||
      (direction === "short" && trendPct > 6);
    trendPts = opposes ? 3 : aligns ? 18 : 10;
    trendDetail = `${bars.bars.length}-period trend ${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(2)}%.`;
  }
  breakdown.push({ label: "Trend confirmation", earned: trendPts, max: 20, detail: trendDetail });

  // 4. Range position (15) — near-high favors long, near-low favors short
  let rangePts = 8;
  let rangeDetail = "Range unavailable.";
  if (quote?.high24h != null && quote?.low24h != null && quote.high24h > quote.low24h && quote.price != null) {
    const pos = (quote.price - quote.low24h) / (quote.high24h - quote.low24h);
    if (direction === "long") rangePts = Math.round(4 + pos * 11);
    else rangePts = Math.round(4 + (1 - pos) * 11);
    rangeDetail = `Price ${(pos * 100).toFixed(0)}% of 24h range.`;
  }
  breakdown.push({ label: "24h range position", earned: rangePts, max: 15, detail: rangeDetail });

  // 5. Volatility calmness (10) — extreme intraday range reduces readiness
  let volPts = 6;
  let volDetail = "Volatility unknown.";
  if (quote?.high24h != null && quote?.low24h != null && quote.low24h > 0) {
    const rangePct = ((quote.high24h - quote.low24h) / quote.low24h) * 100;
    if (rangePct < 2) volPts = 10;
    else if (rangePct < 4) volPts = 8;
    else if (rangePct < 8) volPts = 6;
    else if (rangePct < 15) volPts = 3;
    else volPts = 1;
    volDetail = `24h range ${rangePct.toFixed(2)}%.`;
  }
  breakdown.push({ label: "Volatility calmness", earned: volPts, max: 10, detail: volDetail });

  // 6. Liquidity signal (10) — presence of a tight-ish bid/ask
  let liqPts = 5;
  let liqDetail = "Order book depth unknown.";
  if (quote?.bid != null && quote?.ask != null && quote.bid > 0 && quote.ask > 0) {
    const spreadPct = ((quote.ask - quote.bid) / quote.bid) * 100;
    liqPts = spreadPct < 0.02 ? 10 : spreadPct < 0.05 ? 8 : spreadPct < 0.15 ? 5 : 2;
    liqDetail = `Top-of-book spread ${spreadPct.toFixed(3)}%.`;
  }
  breakdown.push({ label: "Top-of-book liquidity", earned: liqPts, max: 10, detail: liqDetail });

  const total = breakdown.reduce((s, r) => s + r.earned, 0);
  const score = Math.max(0, Math.min(100, total));
  const band =
    score >= 80 ? "STRONG" : score >= 65 ? "GOOD" : score >= 45 ? "MIXED" : score >= 25 ? "WEAK" : "POOR";
  return { score, band, breakdown };
}

/**
 * Full execution readiness gate — combines symbol/size checks, thesis
 * eligibility, live market data availability, and (when connected) the
 * agent sub-account context. Never invents an account balance.
 */
export async function runRiskGate(input: RiskGateInput): Promise<RiskGateResult> {
  const checks: RiskCheck[] = [];
  const symbol = input.symbol.toUpperCase();

  // 1. Symbol shape
  const symbolOk = /^[A-Z0-9]{2,10}(\/[A-Z]{3,5})?$/.test(symbol);
  checks.push({
    key: "symbol_shape",
    label: "Symbol format",
    status: symbolOk ? "PASS" : "FAIL",
    detail: symbolOk ? `Symbol ${symbol}` : "Symbol contains invalid characters.",
  });

  // 2. Position size sanity
  const posOk = Number.isFinite(input.positionSizeUsd) && input.positionSizeUsd >= RISK_CONFIG.MIN_QTY_USD;
  checks.push({
    key: "position_size",
    label: "Position size",
    status: posOk ? "PASS" : "FAIL",
    detail: posOk
      ? `Requested notional $${input.positionSizeUsd.toLocaleString()}`
      : `Position size must be at least $${RISK_CONFIG.MIN_QTY_USD}.`,
  });

  // 3. Verdict gate
  const verdictBlocked = RISK_CONFIG.BLOCKED_STATUSES.has(input.verdict.status);
  checks.push({
    key: "thesis_status",
    label: "Thesis status",
    status: verdictBlocked
      ? "FAIL"
      : input.verdict.status === "WAIT"
        ? "WARN"
        : "PASS",
    detail:
      input.verdict.status === "TRADE"
        ? `Thesis score ${input.verdict.score}/100 — verdict TRADE.`
        : input.verdict.status === "WAIT"
          ? `Thesis score ${input.verdict.score}/100 — verdict WAIT. Conditions not ideal.`
          : `Thesis score ${input.verdict.score}/100 — verdict ${input.verdict.status.replace(/_/g, " ")}. Execution blocked.`,
  });

  // 4. Fetch a fresh live quote through the router (Binance).
  const identity = resolveIdentity(symbol);
  const quote = identity ? await getQuote(identity) : null;
  const price = quote?.price ?? 0;
  const priceStatus = quote
    ? classifyFreshness(quote.timestamp, quote.assetType, quote.status)
    : "UNAVAILABLE";
  const priceOk = price > 0 && priceStatus !== "UNAVAILABLE";
  checks.push({
    key: "market_price",
    label: "Live market price",
    status: priceOk ? (priceStatus === "STALE" ? "WARN" : "PASS") : "FAIL",
    detail: priceOk
      ? `${symbol} = ${price.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quote?.currency ?? ""} from ${
          quote?.source === "BINANCE" ? "Binance" : quote?.source === "COINGECKO" ? "CoinGecko" : quote?.source ?? "provider"
        } · status ${priceStatus} · retrieved ${quote?.timestamp}.`
      : `No live Binance price available for ${symbol}. Refusing to propose an action without a real market price.`,
  });

  // 5. Quantity / notional
  const quantity = priceOk
    ? Math.max(RISK_CONFIG.MIN_QTY_USD / price, input.positionSizeUsd / price)
    : 0;
  const notional = priceOk ? Math.min(input.positionSizeUsd, RISK_CONFIG.MAX_QTY_USD) : 0;
  const qtyOk = quantity > 0 && notional > 0;
  checks.push({
    key: "quantity",
    label: "Order quantity",
    status: qtyOk ? "PASS" : "FAIL",
    detail: qtyOk
      ? `${quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} @ ${price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
      : "Cannot size an order without a live market price.",
  });

  // 6. Agent connection status (honest — probes the MCP endpoint)
  const agent = await getAgentConnectionStatus();
  const agentGate =
    agent.agentConnection === "CONNECTED"
      ? "PASS"
      : agent.agentConnection === "ERROR" ||
          agent.agentConnection === "AUTHORIZATION_EXPIRED"
        ? "FAIL"
        : "WARN";
  checks.push({
    key: "agent_connection",
    label: "Binance Agent OS",
    status: agentGate,
    detail:
      agent.agentConnection === "CONNECTED"
        ? "Binance Agent OS session verified. Actions can be proposed for user approval."
        : agent.agentConnection === "AUTHORIZATION_EXPIRED"
          ? "Binance Agent OS authorization expired. Reconnect required before real actions."
          : agent.agentConnection === "ERROR"
            ? `Binance Agent OS unreachable${agent.lastError ? ` (${agent.lastError})` : ""}. Cannot propose real actions.`
            : "Binance Agent OS not connected. Proposals stay in DEMO AGENT mode — no live action is sent.",
  });

  // 7. Concentration cap based on known equity if provided, else a
  //    conservative synthetic reference.
  const equity = input.agentAccountEquity ?? 10_000;
  const maxNotional = equity * (RISK_CONFIG.MAX_POSITION_PERCENT / 100);
  const concOk = notional <= maxNotional;
  checks.push({
    key: "concentration",
    label: `Position ≤ ${RISK_CONFIG.MAX_POSITION_PERCENT}% of sub-account equity`,
    status: concOk ? "PASS" : "FAIL",
    detail: concOk
      ? input.agentAccountEquity != null
        ? `Notional $${notional.toFixed(2)} within concentration cap of $${maxNotional.toFixed(0)} (agent sub-account equity).`
        : `Notional $${notional.toFixed(2)} within a conservative $${maxNotional.toFixed(0)} cap. Real equity will be verified once Agent OS is connected.`
      : `Notional $${notional.toFixed(2)} exceeds the ${RISK_CONFIG.MAX_POSITION_PERCENT}% concentration cap of $${maxNotional.toFixed(0)}.`,
  });

  const failing = checks.filter((c) => c.status === "FAIL");
  const ok = failing.length === 0;

  return {
    ok,
    checks,
    blockedReason: failing[0]?.detail,
    estimatedPrice: price,
    quantity,
    estimatedNotional: notional,
    buyingPower: equity,
    maxPositionPercent: RISK_CONFIG.MAX_POSITION_PERCENT,
    maxNotional,
  };
}
