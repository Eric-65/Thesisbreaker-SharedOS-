import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";

export const theses = pgTable("theses", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().default("STOCK"), // STOCK|ETF|CRYPTO|NFT_COLLECTION
  direction: text("direction").notNull(), // "long" | "short"
  timeHorizon: text("time_horizon").notNull().default("3-6M"),
  positionSize: text("position_size").notNull().default("1000"),
  riskTolerance: text("risk_tolerance").notNull().default("moderate"),
  originalText: text("original_text").notNull(),
  catalysts: text("catalysts"),
  expectedOutcome: text("expected_outcome"),

  // Immutable snapshot of first analysis (WHAT I BELIEVED THEN)
  originalAnalysis: jsonb("original_analysis").notNull(),
  originalExtraction: jsonb("original_extraction").notNull(),
  initialScore: integer("initial_score").notNull(),

  // Latest analysis (WHAT THE EVIDENCE SHOWS NOW)
  analysis: jsonb("analysis").notNull(),
  currentScore: integer("current_score").notNull(),
  status: text("status").notNull().default("CHALLENGED"),
  paperOrderId: text("paper_order_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  thesisId: uuid("thesis_id").notNull().references(() => theses.id, { onDelete: "cascade" }),
  alpacaOrderId: text("alpaca_order_id"),
  clientOrderId: text("client_order_id").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // buy | sell
  qty: numeric("qty").notNull(),
  orderType: text("order_type").notNull().default("market"),
  status: text("status").notNull(), // filled | pending | rejected | ...
  estimatedPrice: numeric("estimated_price"),
  estimatedNotional: numeric("estimated_notional"),
  mode: text("mode").notNull().default("demo"), // demo | live
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monitoringEvents = pgTable("monitoring_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  thesisId: uuid("thesis_id").notNull().references(() => theses.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  scoreBefore: integer("score_before"),
  scoreAfter: integer("score_after"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Thesis = typeof theses.$inferSelect;
export type NewThesis = typeof theses.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type MonitoringEvent = typeof monitoringEvents.$inferSelect;
export type NewMonitoringEvent = typeof monitoringEvents.$inferInsert;

export const watchlist = pgTable("watchlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull().unique(),
  assetType: text("asset_type").notNull(), // STOCK|ETF|CRYPTO|NFT_COLLECTION
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WatchlistItem = typeof watchlist.$inferSelect;

/** Every Arena service invocation is persisted here so the SharedOS audit
 * trail can be reconstructed and displayed. Independent of the trading
 * `theses` table, and never contains chain-of-thought. */
export const serviceCalls = pgTable("service_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  service: text("service").notNull(), // 'break_thesis' | 'verify_claim'
  purpose: text("purpose").notNull(),
  callerAgentId: text("caller_agent_id"),
  callerName: text("caller_name"),
  requestId: text("request_id").notNull(),
  request: jsonb("request").notNull(),
  response: jsonb("response"),
  outcome: text("outcome").notNull(), // 'ALLOWED' | 'DENIED' | 'ERROR'
  mode: text("mode").notNull(), // 'LOCAL' | 'SHARED_OS_CLOUD'
  grantedCapabilities: jsonb("granted_capabilities").notNull(),
  requiredCapabilities: jsonb("required_capabilities").notNull(),
  deniedReason: text("denied_reason"),
  deniedMissing: jsonb("denied_missing"),
  errorMessage: text("error_message"),
  priceCredits: integer("price_credits"),
  durationMs: integer("duration_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceCall = typeof serviceCalls.$inferSelect;
export type NewServiceCall = typeof serviceCalls.$inferInsert;

/**
 * Audit events emitted by the SharedOS kernel itself. Rows here are written
 * verbatim from `AuditEvent` objects the kernel produced — nothing in this
 * table is synthesized by ThesisBreaker.
 */
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  outcome: text("outcome").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  traceId: text("trace_id").notNull(),
  namespaceId: text("namespace_id").notNull(),
  purpose: text("purpose").notNull(),
  actor: jsonb("actor").notNull(),
  authority: jsonb("authority").notNull(),
  owner: jsonb("owner").notNull(),
  resource: jsonb("resource"),
  action: text("action"),
  tool: text("tool"),
  grantId: text("grant_id"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditEventRow = typeof auditEvents.$inferSelect;

/**
 * Arena credit movements this product observed. ThesisBreaker does NOT settle
 * payments — SharedNet does. These rows record what another agent told us, and
 * what the SharedNet ledger confirmed, so a transaction can be reconciled.
 */
export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  direction: text("direction").notNull(), // 'INBOUND' | 'OUTBOUND'
  counterpartyId: text("counterparty_id"),
  counterpartyName: text("counterparty_name"),
  amount: integer("amount").notNull(),
  service: text("service"),
  requestId: text("request_id"),
  memo: text("memo"),
  status: text("status").notNull().default("CLAIMED"), // CLAIMED | CONFIRMED | DISPUTED
  sharednetTxnId: text("sharednet_txn_id"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
