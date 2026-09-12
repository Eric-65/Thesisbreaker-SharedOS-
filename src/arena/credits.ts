/**
 * Arena credit tracking.
 *
 * ThesisBreaker does NOT settle payments — SharedNet does. This module records
 * what we delivered, what a counterparty claimed to send, and what the
 * SharedNet ledger actually shows, so the three can be reconciled.
 *
 * A claim is never treated as a confirmed payment.
 */

import type { ServiceName } from "../lib/arena/config";

export interface Delivery {
  requestId: string;
  service: ServiceName;
  counterparty: string;
  amountDue: number;
  deliveredAt: string;
}

export interface PaymentClaim {
  counterparty: string;
  amount: number | null;
  memo: string | null;
  claimedAt: string;
}

export interface ReconciledTransaction {
  requestId: string;
  service: ServiceName;
  counterparty: string;
  amountDue: number;
  claimed: boolean;
  claimedAmount: number | null;
  status: "AWAITING_PAYMENT" | "CLAIMED" | "SETTLED";
}

export class CreditLedger {
  readonly #deliveries = new Map<string, Delivery>();
  readonly #claims: PaymentClaim[] = [];
  #spent = 0;

  recordDelivery(delivery: Delivery): void {
    if (delivery.amountDue <= 0) return; // free tier is never invoiced
    this.#deliveries.set(delivery.requestId, delivery);
  }

  /**
   * Records that a counterparty said it sent credits. If the memo names a
   * request we delivered, the two are linked; otherwise the claim is kept
   * unmatched rather than being applied to an arbitrary invoice.
   */
  recordClaim(claim: PaymentClaim): { matched: Delivery | null } {
    this.#claims.push(claim);
    if (claim.memo && this.#deliveries.has(claim.memo)) {
      return { matched: this.#deliveries.get(claim.memo)! };
    }
    return { matched: null };
  }

  recordSpend(amount: number): void {
    this.#spent += amount;
  }

  claimsFrom(counterparty: string): PaymentClaim[] {
    return this.#claims.filter((c) => c.counterparty === counterparty);
  }

  reconcile(): ReconciledTransaction[] {
    return [...this.#deliveries.values()].map((delivery) => {
      const claim = this.#claims.find(
        (c) =>
          c.memo === delivery.requestId ||
          (c.memo === null && c.counterparty === delivery.counterparty),
      );
      return {
        requestId: delivery.requestId,
        service: delivery.service,
        counterparty: delivery.counterparty,
        amountDue: delivery.amountDue,
        claimed: claim !== undefined,
        claimedAmount: claim?.amount ?? null,
        status: claim ? "CLAIMED" : "AWAITING_PAYMENT",
      };
    });
  }

  summary() {
    const transactions = this.reconcile();
    return {
      deliveries: transactions.length,
      credits_invoiced: transactions.reduce((sum, t) => sum + t.amountDue, 0),
      credits_claimed: transactions
        .filter((t) => t.claimed)
        .reduce((sum, t) => sum + (t.claimedAmount ?? t.amountDue), 0),
      awaiting_payment: transactions.filter((t) => !t.claimed).length,
      credits_spent: this.#spent,
      unmatched_claims: this.#claims.filter(
        (c) => c.memo === null || !this.#deliveries.has(c.memo),
      ).length,
    };
  }
}
