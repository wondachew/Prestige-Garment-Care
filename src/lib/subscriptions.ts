import type { Db } from "./db";
import { tx } from "./db";
import { audit, recomputePaymentStatus, ValidationError } from "./orders";
import { normalizeEthiopianMobile } from "./phone";

/** Category slugs that count against a plan's suit and shirt allowances. */
export const SUIT_CATEGORY_SLUGS = ["mens-two-piece", "womens-two-piece", "three-piece"];
export const SHIRT_CATEGORY_SLUGS = ["dress-shirts", "womens-blouses"];
export const PLAN_PERIOD_DAYS = 30;

export interface Usage {
  suits: number;
  shirts: number;
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

/** Counts allowance-relevant garments on an order. */
export function countOrderUsage(db: Db, orderId: number): Usage {
  const rows = db
    .prepare(
      `SELECT c.slug AS slug, SUM(oi.quantity) AS qty FROM order_items oi
       JOIN services s ON s.id = oi.service_id JOIN service_categories c ON c.id = s.category_id
       WHERE oi.order_id = ? GROUP BY c.slug`,
    )
    .all(orderId) as { slug: string; qty: number }[];
  const usage: Usage = { suits: 0, shirts: 0 };
  for (const r of rows) {
    if (SUIT_CATEGORY_SLUGS.includes(r.slug)) usage.suits += Number(r.qty);
    else if (SHIRT_CATEGORY_SLUGS.includes(r.slug)) usage.shirts += Number(r.qty);
  }
  return usage;
}

/** Sum of catalogue prices for the first `suits` suit units and `shirts` shirt units on an order. */
function creditFor(db: Db, orderId: number, suits: number, shirts: number): number {
  const lines = db
    .prepare(
      `SELECT c.slug AS slug, oi.unit_price_etb AS price, oi.quantity AS qty FROM order_items oi
       JOIN services s ON s.id = oi.service_id JOIN service_categories c ON c.id = s.category_id
       WHERE oi.order_id = ? ORDER BY oi.id`,
    )
    .all(orderId) as { slug: string; price: number; qty: number }[];
  let credit = 0;
  let remSuits = suits;
  let remShirts = shirts;
  for (const l of lines) {
    let take = 0;
    if (SUIT_CATEGORY_SLUGS.includes(l.slug)) { take = Math.min(remSuits, l.qty); remSuits -= take; }
    else if (SHIRT_CATEGORY_SLUGS.includes(l.slug)) { take = Math.min(remShirts, l.qty); remShirts -= take; }
    credit += take * l.price;
  }
  return credit;
}

export interface SubscriptionRow {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  plan_id: number;
  plan_name: string;
  suit_allowance: number;
  shirt_allowance: number;
  status: string;
  starts_on: string;
  expires_on: string;
  suits_used: number;
  shirts_used: number;
}

export function listSubscriptions(db: Db): SubscriptionRow[] {
  return db
    .prepare(
      `SELECT s.id, s.customer_id, c.name AS customer_name, c.phone AS customer_phone, s.plan_id, p.name AS plan_name,
         p.suit_allowance, p.shirt_allowance, s.status, s.starts_on, s.expires_on, s.suits_used, s.shirts_used
       FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN subscription_plans p ON p.id = s.plan_id
       ORDER BY s.status = 'active' DESC, s.expires_on DESC, s.id DESC LIMIT 200`,
    )
    .all() as unknown as SubscriptionRow[];
}

/**
 * Manually activates a plan for a customer (pilot process: payment is confirmed by admin first).
 * Any currently active subscription for the same customer is closed as 'expired' (replaced).
 */
export function activateSubscription(
  db: Db,
  input: { name: string; phone: string; planId: number; startsOn: string },
  actor: string,
): number {
  const name = input.name.trim();
  if (name.length < 2) throw new ValidationError("Customer name is required.");
  const phone = normalizeEthiopianMobile(input.phone);
  if (!phone) throw new ValidationError("Enter a valid Ethiopian mobile number.");
  if (!isIsoDate(input.startsOn)) throw new ValidationError("Choose a valid start date.");
  const plan = db.prepare("SELECT id FROM subscription_plans WHERE id = ? AND active = 1").get(input.planId);
  if (!plan) throw new ValidationError("Choose an active plan.");

  return tx(db, () => {
    const customer = db
      .prepare("INSERT INTO customers (name, phone) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name RETURNING id")
      .get(name, phone) as { id: number };
    db.prepare("UPDATE subscriptions SET status = 'expired' WHERE customer_id = ? AND status = 'active'").run(customer.id);
    const res = db
      .prepare("INSERT INTO subscriptions (customer_id, plan_id, status, starts_on, expires_on) VALUES (?, ?, 'active', ?, ?)")
      .run(customer.id, input.planId, input.startsOn, addDaysIso(input.startsOn, PLAN_PERIOD_DAYS));
    const id = Number(res.lastInsertRowid);
    audit(db, actor, "subscription.activate", `subscription ${id} customer ${customer.id} plan ${input.planId}`);
    return id;
  });
}

/**
 * Attaches an order to an active subscription. Garments within the remaining allowance become a
 * subscription credit. Overage is charged at catalogue price unless `approve` waives it (admin approval).
 */
export function attachOrderToSubscription(db: Db, orderId: number, subscriptionId: number, approve: boolean, actor: string): void {
  tx(db, () => {
    const order = db
      .prepare("SELECT id, customer_id, subscription_id, subtotal_etb, discount_etb, delivery_fee_etb, preferred_collection_date FROM orders WHERE id = ?")
      .get(orderId) as
      | { id: number; customer_id: number; subscription_id: number | null; subtotal_etb: number; discount_etb: number; delivery_fee_etb: number; preferred_collection_date: string }
      | undefined;
    if (!order) throw new ValidationError("Order not found.");
    if (order.subscription_id) throw new ValidationError("This order is already attached to a subscription.");

    const sub = db
      .prepare(
        `SELECT s.*, p.suit_allowance, p.shirt_allowance FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.id = ?`,
      )
      .get(subscriptionId) as
      | { customer_id: number; status: string; starts_on: string; expires_on: string; suits_used: number; shirts_used: number; suit_allowance: number; shirt_allowance: number }
      | undefined;
    if (!sub) throw new ValidationError("Subscription not found.");
    if (sub.customer_id !== order.customer_id) throw new ValidationError("That subscription belongs to a different customer.");
    if (sub.status !== "active") throw new ValidationError("That subscription is not active.");
    if (order.preferred_collection_date < sub.starts_on || order.preferred_collection_date > sub.expires_on) {
      throw new ValidationError("The collection date is outside this subscription period.");
    }

    const usage = countOrderUsage(db, orderId);
    const remSuits = Math.max(0, sub.suit_allowance - sub.suits_used);
    const remShirts = Math.max(0, sub.shirt_allowance - sub.shirts_used);
    const coveredSuits = approve ? usage.suits : Math.min(usage.suits, remSuits);
    const coveredShirts = approve ? usage.shirts : Math.min(usage.shirts, remShirts);
    const credit = creditFor(db, orderId, coveredSuits, coveredShirts);
    const total = order.subtotal_etb - order.discount_etb - credit + order.delivery_fee_etb;

    db.prepare(
      `UPDATE orders SET subscription_id = ?, subscription_approved = ?, subscription_credit_etb = ?,
         subscription_covered_suits = ?, subscription_covered_shirts = ?, total_etb = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(subscriptionId, approve ? 1 : 0, credit, coveredSuits, coveredShirts, total, orderId);
    db.prepare("UPDATE subscriptions SET suits_used = suits_used + ?, shirts_used = shirts_used + ? WHERE id = ?").run(coveredSuits, coveredShirts, subscriptionId);
    recomputePaymentStatus(db, orderId);
    audit(db, actor, "subscription.attach", `order ${orderId} sub ${subscriptionId} covered ${coveredSuits}s/${coveredShirts}sh credit ${credit} approved ${approve}`);
  });
}

/** Reverses an attachment: restores allowance counters and removes the credit from the order total. */
export function detachOrderFromSubscription(db: Db, orderId: number, actor: string): void {
  tx(db, () => {
    const order = db
      .prepare("SELECT subscription_id, subscription_credit_etb, subscription_covered_suits, subscription_covered_shirts, subtotal_etb, discount_etb, delivery_fee_etb FROM orders WHERE id = ?")
      .get(orderId) as
      | { subscription_id: number | null; subscription_credit_etb: number; subscription_covered_suits: number; subscription_covered_shirts: number; subtotal_etb: number; discount_etb: number; delivery_fee_etb: number }
      | undefined;
    if (!order) throw new ValidationError("Order not found.");
    if (!order.subscription_id) throw new ValidationError("This order is not attached to a subscription.");
    db.prepare("UPDATE subscriptions SET suits_used = MAX(0, suits_used - ?), shirts_used = MAX(0, shirts_used - ?) WHERE id = ?").run(
      order.subscription_covered_suits,
      order.subscription_covered_shirts,
      order.subscription_id,
    );
    const total = order.subtotal_etb - order.discount_etb + order.delivery_fee_etb;
    db.prepare(
      `UPDATE orders SET subscription_id = NULL, subscription_approved = 0, subscription_credit_etb = 0,
         subscription_covered_suits = 0, subscription_covered_shirts = 0, total_etb = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(total, orderId);
    recomputePaymentStatus(db, orderId);
    audit(db, actor, "subscription.detach", `order ${orderId}`);
  });
}

/** Active subscriptions expiring within `days` days from `today` (for renewal reminders). */
export function expiringSubscriptions(db: Db, today: string, days = 7): SubscriptionRow[] {
  return listSubscriptions(db).filter(
    (s) => s.status === "active" && s.expires_on >= today && s.expires_on <= addDaysIso(today, days),
  );
}
