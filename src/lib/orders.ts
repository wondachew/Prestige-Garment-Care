import { randomBytes, randomInt } from "node:crypto";
import type { Db } from "./db";
import { tx } from "./db";
import { computeTotals, type Discount } from "./money";
import { normalizeEthiopianMobile } from "./phone";
import { isOrderStatus, type OrderStatus } from "./status";

export const PAYMENT_METHODS = ["telebirr", "cbe_birr", "bank_transfer", "cash_on_delivery"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  telebirr: "Telebirr",
  cbe_birr: "CBE Birr",
  bank_transfer: "Bank transfer",
  cash_on_delivery: "Cash on delivery",
};

export class ValidationError extends Error {}

export interface CartLine {
  serviceId: number;
  quantity: number;
  careNotes: string;
}

export interface NewOrderInput {
  customerName: string;
  phone: string;
  email: string | null;
  collectionAddress: string;
  zoneId: number;
  deliveryAddress: string;
  collectionDate: string;
  collectionWindow: string;
  deliveryDate: string | null;
  deliveryInstructions: string;
  paymentMethod: string;
  discountCode: string | null;
  items: CartLine[];
  /** Set only when a signed-in customer places the order with their own number. */
  accountCustomerId?: number | null;
}

/** Today's date (YYYY-MM-DD) in the business timezone, Africa/Addis_Ababa. */
export function todayInAddis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function newOrderNo(now: Date): string {
  const ymd = todayInAddis(now).replace(/-/g, "");
  return `ESC-${ymd}-${randomInt(1000, 10000)}`;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/.test(e.message);
}

export function findDiscount(db: Db, rawCode: string | null | undefined): { code: string; discount: Discount } | null {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const row = db.prepare("SELECT code, kind, value FROM discounts WHERE code = ? AND active = 1").get(code) as
    | { code: string; kind: "percent" | "fixed"; value: number }
    | undefined;
  if (!row) return null;
  return { code: row.code, discount: { kind: row.kind, value: row.value } };
}

/**
 * Creates an order. Prices, delivery fee and discount are read from the database here,
 * never trusted from the client. Each unit of garment receives its own traceable tag.
 */
export function createOrder(db: Db, input: NewOrderInput, now: Date = new Date()) {
  const name = input.customerName.trim();
  if (name.length < 2) throw new ValidationError("Please enter your full name.");

  const phone = normalizeEthiopianMobile(input.phone);
  if (!phone) throw new ValidationError("Enter a valid Ethiopian mobile number, e.g. 0911 234 567 or +251 911 234 567.");

  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("Enter a valid email address or leave it blank.");

  const collectionAddress = input.collectionAddress.trim();
  const deliveryAddress = input.deliveryAddress.trim();
  if (collectionAddress.length < 5) throw new ValidationError("Please enter a collection address.");
  if (deliveryAddress.length < 5) throw new ValidationError("Please enter a delivery address.");

  if (!isIsoDate(input.collectionDate) || input.collectionDate < todayInAddis(now)) {
    throw new ValidationError("Choose a collection date from today onward.");
  }
  if (input.deliveryDate && (!isIsoDate(input.deliveryDate) || input.deliveryDate < input.collectionDate)) {
    throw new ValidationError("The return date must be on or after the collection date.");
  }
  if (!input.collectionWindow.trim()) throw new ValidationError("Choose a collection time window.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.paymentMethod)) throw new ValidationError("Choose a payment method.");
  if (input.items.length === 0) throw new ValidationError("Your cart is empty.");

  const zone = db
    .prepare("SELECT id, fee_etb FROM delivery_zones WHERE id = ? AND active = 1")
    .get(input.zoneId) as { id: number; fee_etb: number } | undefined;
  if (!zone) throw new ValidationError("Choose a valid delivery zone.");

  const priced = input.items.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      throw new ValidationError("Quantities must be between 1 and 50.");
    }
    const svc = db
      .prepare("SELECT id, name, price_etb, turnaround_days FROM services WHERE id = ? AND active = 1")
      .get(line.serviceId) as { id: number; name: string; price_etb: number; turnaround_days: number } | undefined;
    if (!svc) throw new ValidationError("One of the garments in your cart is no longer available. Please review your cart.");
    return { svc, quantity: line.quantity, careNotes: line.careNotes.slice(0, 300) };
  });

  let discount: Discount = null;
  let discountCode: string | null = null;
  if (input.discountCode?.trim()) {
    const found = findDiscount(db, input.discountCode);
    if (!found) throw new ValidationError("That discount code is not valid.");
    discount = found.discount;
    discountCode = found.code;
  }

  const totals = computeTotals(
    priced.map((p) => ({ unitPrice: p.svc.price_etb, quantity: p.quantity })),
    zone.fee_etb,
    discount,
  );

  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNo = newOrderNo(now);
    try {
      return tx(db, () => {
        let customerId: number | null = null;
        if (input.accountCustomerId) {
          const acct = db
            .prepare("SELECT phone FROM customers WHERE id = ? AND password_hash IS NOT NULL")
            .get(input.accountCustomerId) as { phone: string } | undefined;
          if (!acct || acct.phone !== phone) throw new ValidationError("Please use the mobile number on your account.");
          customerId = input.accountCustomerId;
        }

        const trackingToken = randomBytes(16).toString("hex");
        const res = db
          .prepare(
            `INSERT INTO orders (order_no, tracking_token, customer_id, customer_name, customer_phone, customer_email,
               collection_address, zone_id, delivery_address, preferred_collection_date, preferred_collection_window,
               preferred_delivery_date, delivery_instructions, payment_method, subtotal_etb, delivery_fee_etb,
               discount_etb, discount_code, total_etb)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            orderNo,
            trackingToken,
            customerId,
            name,
            phone,
            email,
            collectionAddress,
            zone.id,
            deliveryAddress,
            input.collectionDate,
            input.collectionWindow.trim(),
            input.deliveryDate,
            input.deliveryInstructions.trim().slice(0, 500),
            input.paymentMethod,
            totals.subtotal,
            totals.deliveryFee,
            totals.discount,
            discountCode,
            totals.total,
          );
        const orderId = Number(res.lastInsertRowid);

        for (const p of priced) {
          const item = db
            .prepare(
              `INSERT INTO order_items (order_id, service_id, service_name, unit_price_etb, quantity, line_total_etb, care_notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(orderId, p.svc.id, p.svc.name, p.svc.price_etb, p.quantity, p.svc.price_etb * p.quantity, p.careNotes);
          const itemId = Number(item.lastInsertRowid);
          for (let seq = 1; seq <= p.quantity; seq++) {
            db.prepare("INSERT INTO garments (order_item_id, tag, seq) VALUES (?, ?, ?)").run(
              itemId,
              `${orderNo}-${itemId}-${seq}`,
              seq,
            );
          }
        }

        db.prepare("INSERT INTO status_history (order_id, status, note, actor) VALUES (?, 'order_placed', 'Order placed online', 'customer')").run(orderId);
        return { orderId, orderNo, trackingToken, total: totals.total };
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate an order number.");
}

export function audit(db: Db, actor: string, action: string, detail = ""): void {
  db.prepare("INSERT INTO audit_logs (actor, action, detail) VALUES (?, ?, ?)").run(actor, action, detail);
}

export function setOrderStatus(db: Db, orderId: number, status: string, note: string, actor: string): void {
  if (!isOrderStatus(status)) throw new ValidationError("Unknown order status.");
  tx(db, () => {
    const res = db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
    if (Number(res.changes) === 0) throw new ValidationError("Order not found.");
    db.prepare("INSERT INTO status_history (order_id, status, note, actor) VALUES (?, ?, ?, ?)").run(orderId, status, note.trim().slice(0, 500), actor);
    audit(db, actor, "order.status", `order ${orderId} -> ${status}`);
  });
}

export interface OpsUpdate {
  courierId: number | null;
  cleaningPartnerId: number | null;
  cleaningCost: number;
  courierCost: number;
  packagingCost: number;
}

export function updateOrderOps(db: Db, orderId: number, ops: OpsUpdate, actor: string): void {
  for (const v of [ops.cleaningCost, ops.courierCost, ops.packagingCost]) {
    if (!Number.isInteger(v) || v < 0) throw new ValidationError("Costs must be whole ETB amounts of zero or more.");
  }
  tx(db, () => {
    db.prepare(
      `UPDATE orders SET courier_id = ?, cleaning_partner_id = ?, cleaning_cost_etb = ?, courier_cost_etb = ?,
         packaging_cost_etb = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(ops.courierId, ops.cleaningPartnerId, ops.cleaningCost, ops.courierCost, ops.packagingCost, orderId);
    audit(db, actor, "order.ops", `order ${orderId}`);
  });
}

export interface PaymentInput {
  method: string;
  amount: number;
  reference: string;
  status: "awaiting_verification" | "paid" | "failed" | "refunded";
}

/** Records a manual/verified payment and recomputes the order's payment status. */
export function recordPayment(db: Db, orderId: number, input: PaymentInput, actor: string): string {
  const reference = input.reference.trim();
  if (!reference) throw new ValidationError("A transaction reference is required to record a payment.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationError("Amount must be a positive whole ETB value.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) throw new ValidationError("Unknown payment method.");
  return tx(db, () => {
    const order = db.prepare("SELECT total_etb FROM orders WHERE id = ?").get(orderId) as { total_etb: number } | undefined;
    if (!order) throw new ValidationError("Order not found.");
    try {
      db.prepare("INSERT INTO payments (order_id, method, amount_etb, reference, status) VALUES (?, ?, ?, ?, ?)").run(
        orderId,
        input.method,
        input.amount,
        reference,
        input.status,
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationError("This transaction reference has already been recorded.");
      throw e;
    }
    const status = recomputePaymentStatus(db, orderId);
    audit(db, actor, "payment.record", `order ${orderId} ${input.status} ${input.amount} ref ${reference}`);
    return status;
  });
}

/** Derives payment_status from the ledger: paid - refunded against the order total. */
export function recomputePaymentStatus(db: Db, orderId: number): string {
  const t = db
    .prepare(
      `SELECT o.total_etb AS total,
         COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount_etb ELSE 0 END), 0) AS paid,
         COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN p.amount_etb ELSE 0 END), 0) AS refunded,
         COALESCE(SUM(CASE WHEN p.status = 'awaiting_verification' THEN 1 ELSE 0 END), 0) AS pending_checks
       FROM orders o LEFT JOIN payments p ON p.order_id = o.id WHERE o.id = ? GROUP BY o.id`,
    )
    .get(orderId) as { total: number; paid: number; refunded: number; pending_checks: number };
  const net = t.paid - t.refunded;
  let status: string;
  if (t.paid > 0 && t.refunded >= t.paid) status = "refunded";
  else if (net >= t.total) status = "paid";
  else if (net > 0) status = "partially_paid";
  else if (t.pending_checks > 0) status = "awaiting_verification";
  else status = "pending";
  db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
  return status;
}

export interface OrderListRow {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  payment_status: string;
  total_etb: number;
  preferred_collection_date: string;
  created_at: string;
  courier_name: string | null;
  partner_name: string | null;
}

export function listOrders(db: Db, filter: { status?: string; q?: string } = {}): OrderListRow[] {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.status && isOrderStatus(filter.status)) {
    where.push("o.status = ?");
    params.push(filter.status);
  }
  if (filter.q) {
    where.push("(o.order_no LIKE ? OR o.customer_phone LIKE ? OR o.customer_name LIKE ?)");
    const like = `%${filter.q}%`;
    params.push(like, like, like);
  }
  const sql = `SELECT o.id, o.order_no, o.customer_name, o.customer_phone, o.status, o.payment_status, o.total_etb,
      o.preferred_collection_date, o.created_at, c.name AS courier_name, p.name AS partner_name
    FROM orders o LEFT JOIN couriers c ON c.id = o.courier_id LEFT JOIN cleaning_partners p ON p.id = o.cleaning_partner_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY o.created_at DESC, o.id DESC LIMIT 200`;
  return db.prepare(sql).all(...params) as unknown as OrderListRow[];
}

export interface DashboardStats {
  countsByStatus: Record<string, number>;
  totalOrders: number;
  bookedRevenue: number;
  cashReceived: number;
  outstanding: number;
  cleaningCost: number;
  courierCost: number;
  packagingCost: number;
  variableCosts: number;
  contribution: number;
  contributionMarginPct: number;
  revenueByService: { service: string; quantity: number; revenue: number }[];
}

/**
 * Financial definitions (kept distinct on purpose):
 * - bookedRevenue: order totals (after discounts, incl. delivery fees) for non-cancelled orders.
 * - cashReceived: net verified payments (paid minus refunded). Not the same as revenue.
 * - outstanding: booked revenue not yet covered by net cash, per order.
 * - contribution: bookedRevenue minus variable costs (cleaning, courier, packaging). Not operating profit.
 */
export function dashboardStats(db: Db): DashboardStats {
  const counts = db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all() as { status: string; n: number }[];
  const countsByStatus: Record<string, number> = {};
  for (const c of counts) countsByStatus[c.status] = Number(c.n);
  const totalOrders = Object.values(countsByStatus).reduce((a, b) => a + b, 0);

  const rev = db
    .prepare("SELECT COALESCE(SUM(total_etb), 0) AS v, COALESCE(SUM(cleaning_cost_etb),0) AS c, COALESCE(SUM(courier_cost_etb),0) AS k, COALESCE(SUM(packaging_cost_etb),0) AS p FROM orders WHERE status <> 'cancelled'")
    .get() as { v: number; c: number; k: number; p: number };

  const cash = db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_etb WHEN status = 'refunded' THEN -amount_etb ELSE 0 END), 0) AS v FROM payments",
    )
    .get() as { v: number };

  const outstanding = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(o.total_etb - COALESCE(n.net, 0), 0)), 0) AS v
       FROM orders o LEFT JOIN (
         SELECT order_id, SUM(CASE WHEN status = 'paid' THEN amount_etb WHEN status = 'refunded' THEN -amount_etb ELSE 0 END) AS net
         FROM payments GROUP BY order_id) n ON n.order_id = o.id
       WHERE o.status <> 'cancelled'`,
    )
    .get() as { v: number };

  const byService = db
    .prepare(
      `SELECT oi.service_name AS service, SUM(oi.quantity) AS quantity, SUM(oi.line_total_etb) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status <> 'cancelled'
       GROUP BY oi.service_name ORDER BY revenue DESC`,
    )
    .all() as { service: string; quantity: number; revenue: number }[];

  const variableCosts = rev.c + rev.k + rev.p;
  const contribution = rev.v - variableCosts;
  return {
    countsByStatus,
    totalOrders,
    bookedRevenue: rev.v,
    cashReceived: cash.v,
    outstanding: outstanding.v,
    cleaningCost: rev.c,
    courierCost: rev.k,
    packagingCost: rev.p,
    variableCosts,
    contribution,
    contributionMarginPct: rev.v > 0 ? Math.round((contribution / rev.v) * 1000) / 10 : 0,
    revenueByService: byService.map((r) => ({ service: r.service, quantity: Number(r.quantity), revenue: Number(r.revenue) })),
  };
}

export function getOrderByNumber(db: Db, orderNo: string) {
  return db
    .prepare(
      `SELECT o.*, c.name AS courier_name, c.phone AS courier_phone, p.name AS partner_name, z.name AS zone_name
       FROM orders o LEFT JOIN couriers c ON c.id = o.courier_id LEFT JOIN cleaning_partners p ON p.id = o.cleaning_partner_id
       LEFT JOIN delivery_zones z ON z.id = o.zone_id WHERE o.order_no = ?`,
    )
    .get(orderNo) as Record<string, unknown> | undefined;
}

export function getOrderItems(db: Db, orderId: number) {
  return db
    .prepare("SELECT id, service_name, unit_price_etb, quantity, line_total_etb, care_notes FROM order_items WHERE order_id = ? ORDER BY id")
    .all(orderId) as { id: number; service_name: string; unit_price_etb: number; quantity: number; line_total_etb: number; care_notes: string }[];
}

export function getGarments(db: Db, orderId: number) {
  return db
    .prepare(
      `SELECT g.tag, g.seq, i.service_name FROM garments g JOIN order_items i ON i.id = g.order_item_id
       WHERE i.order_id = ? ORDER BY i.id, g.seq`,
    )
    .all(orderId) as { tag: string; seq: number; service_name: string }[];
}

export function getStatusHistory(db: Db, orderId: number) {
  return db
    .prepare("SELECT status, note, actor, created_at FROM status_history WHERE order_id = ? ORDER BY id DESC")
    .all(orderId) as { status: string; note: string; actor: string; created_at: string }[];
}

export function getPayments(db: Db, orderId: number) {
  return db
    .prepare("SELECT method, amount_etb, reference, status, created_at FROM payments WHERE order_id = ? ORDER BY id DESC")
    .all(orderId) as { method: string; amount_etb: number; reference: string; status: string; created_at: string }[];
}
