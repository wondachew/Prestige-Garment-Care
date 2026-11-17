import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db";
import {
  createOrder,
  dashboardStats,
  getGarments,
  getOrderByNumber,
  getOrderItems,
  recordPayment,
  setOrderStatus,
  updateOrderOps,
  ValidationError,
  todayInAddis,
  type NewOrderInput,
} from "../src/lib/orders";

const FUTURE = "2099-01-15";
const NOW = new Date("2099-01-01T06:00:00Z");

function baseInput(overrides: Partial<NewOrderInput> = {}): NewOrderInput {
  const db = dbRef.current!;
  const zone = db.prepare("SELECT id FROM delivery_zones WHERE name = 'Bole'").get() as { id: number };
  const suit = db.prepare("SELECT id FROM services WHERE name = 'Men''s two-piece suit'").get() as { id: number };
  const shirt = db.prepare("SELECT id FROM services WHERE name = 'Dress shirt'").get() as { id: number };
  return {
    customerName: "Abebe Kebede",
    phone: "0911 234 567",
    email: "abebe@example.com",
    collectionAddress: "Bole Atlas, Office 4",
    zoneId: zone.id,
    deliveryAddress: "Bole Atlas, Office 4",
    collectionDate: FUTURE,
    collectionWindow: "Morning (08:00–12:00)",
    deliveryDate: "2099-01-18",
    deliveryInstructions: "Call at reception",
    paymentMethod: "telebirr",
    discountCode: "welcome10",
    items: [
      { serviceId: suit.id, quantity: 2, careNotes: "" },
      { serviceId: shirt.id, quantity: 1, careNotes: "coffee stain on cuff" },
    ],
    ...overrides,
  };
}

const dbRef: { current: Db | null } = { current: null };
function fresh(): Db {
  dbRef.current = openDatabase(":memory:");
  return dbRef.current;
}

test("seed data matches the brief's test prices and plans", () => {
  const db = fresh();
  const prices = db.prepare("SELECT name, price_etb FROM services ORDER BY id").all() as { name: string; price_etb: number }[];
  assert.equal(prices.length, 10);
  assert.equal(prices.find((p) => p.name === "Three-piece suit")?.price_etb, 1100);
  const plans = db.prepare("SELECT price_etb FROM subscription_plans ORDER BY price_etb").all() as { price_etb: number }[];
  assert.deepEqual(plans.map((p) => p.price_etb), [2300, 4400, 6500]);
});

test("order is priced server-side with discount, delivery fee and garment tags", () => {
  const db = fresh();
  const res = createOrder(db, baseInput(), NOW);
  assert.match(res.orderNo, /^ESC-20990101-\d{4}$/);
  const order = getOrderByNumber(db, res.orderNo) as { total_etb: number; subtotal_etb: number; discount_etb: number; delivery_fee_etb: number; customer_phone: string; discount_code: string };
  assert.equal(order.subtotal_etb, 1950);
  assert.equal(order.discount_etb, 195);
  assert.equal(order.delivery_fee_etb, 150);
  assert.equal(order.total_etb, 1905);
  assert.equal(order.customer_phone, "+251911234567");
  assert.equal(order.discount_code, "WELCOME10");
  assert.equal(getGarments(db, Number((db.prepare("SELECT id FROM orders WHERE order_no = ?").get(res.orderNo) as { id: number }).id)).length, 3);
});

test("client cannot change prices: unknown or inactive services are rejected", () => {
  const db = fresh();
  db.prepare("UPDATE services SET active = 0 WHERE name = 'Tie'").run();
  const tie = db.prepare("SELECT id FROM services WHERE name = 'Tie'").get() as { id: number };
  assert.throws(() => createOrder(db, baseInput({ items: [{ serviceId: tie.id, quantity: 1, careNotes: "" }] }), NOW), ValidationError);
  assert.throws(() => createOrder(db, baseInput({ items: [{ serviceId: 99999, quantity: 1, careNotes: "" }] }), NOW), ValidationError);
});

test("historical order prices are unchanged after a price edit", () => {
  const db = fresh();
  const res = createOrder(db, baseInput(), NOW);
  db.prepare("UPDATE services SET price_etb = 5000 WHERE name = 'Men''s two-piece suit'").run();
  const order = getOrderByNumber(db, res.orderNo) as { id: number };
  const items = getOrderItems(db, order.id);
  assert.equal(items.find((i) => i.service_name === "Men's two-piece suit")?.unit_price_etb, 900);
});

test("validation rejects bad phone, past date, return before collection, empty cart and bad discount", () => {
  const db = fresh();
  assert.throws(() => createOrder(db, baseInput({ phone: "12345" }), NOW), /Ethiopian mobile/);
  assert.throws(() => createOrder(db, baseInput({ collectionDate: "2020-01-01" }), NOW), /from today onward/);
  assert.throws(() => createOrder(db, baseInput({ deliveryDate: "2099-01-10" }), NOW), /on or after/);
  assert.throws(() => createOrder(db, baseInput({ items: [] }), NOW), /cart is empty/);
  assert.throws(() => createOrder(db, baseInput({ discountCode: "NOPE" }), NOW), /not valid/);
});

test("status changes are recorded in history", () => {
  const db = fresh();
  const res = createOrder(db, baseInput(), NOW);
  const id = (getOrderByNumber(db, res.orderNo) as { id: number }).id;
  setOrderStatus(db, id, "cleaning_in_progress", "Sent to partner", "admin");
  const row = db.prepare("SELECT status FROM orders WHERE id = ?").get(id) as { status: string };
  assert.equal(row.status, "cleaning_in_progress");
  const hist = db.prepare("SELECT COUNT(*) AS n FROM status_history WHERE order_id = ?").get(id) as { n: number };
  assert.equal(hist.n, 2);
  assert.throws(() => setOrderStatus(db, id, "teleported", "", "admin"), ValidationError);
});

test("payments: partial then full settles the order, duplicate references are blocked", () => {
  const db = fresh();
  const res = createOrder(db, baseInput(), NOW);
  const id = (getOrderByNumber(db, res.orderNo) as { id: number }).id;
  assert.equal(recordPayment(db, id, { method: "telebirr", amount: 1000, reference: "TB123", status: "paid" }, "admin"), "partially_paid");
  assert.throws(() => recordPayment(db, id, { method: "telebirr", amount: 905, reference: "TB123", status: "paid" }, "admin"), /already been recorded/);
  assert.equal(recordPayment(db, id, { method: "bank_transfer", amount: 905, reference: "FT-99", status: "paid" }, "admin"), "paid");
});

test("dashboard separates revenue, cash, outstanding and contribution", () => {
  const db = fresh();
  const res = createOrder(db, baseInput(), NOW);
  const id = (getOrderByNumber(db, res.orderNo) as { id: number }).id;
  recordPayment(db, id, { method: "telebirr", amount: 905, reference: "TB1", status: "paid" }, "admin");
  updateOrderOps(db, id, { courierId: null, cleaningPartnerId: null, cleaningCost: 600, courierCost: 200, packagingCost: 50 }, "admin");
  const s = dashboardStats(db);
  assert.equal(s.totalOrders, 1);
  assert.equal(s.bookedRevenue, 1905);
  assert.equal(s.cashReceived, 905);
  assert.equal(s.outstanding, 1000);
  assert.equal(s.variableCosts, 850);
  assert.equal(s.contribution, 1055);
  assert.equal(s.contributionMarginPct, 55.4);
  setOrderStatus(db, id, "cancelled", "Customer cancelled", "admin");
  assert.equal(dashboardStats(db).bookedRevenue, 0);
});

test("refunds reduce net cash", () => {
  const db = fresh();
  const res = createOrder(db, baseInput(), NOW);
  const id = (getOrderByNumber(db, res.orderNo) as { id: number }).id;
  recordPayment(db, id, { method: "cbe_birr", amount: 905, reference: "CBE-1", status: "paid" }, "admin");
  assert.equal(recordPayment(db, id, { method: "cbe_birr", amount: 905, reference: "CBE-1R", status: "refunded" }, "admin"), "refunded");
});

test("today in Addis is a YYYY-MM-DD string", () => {
  assert.match(todayInAddis(), /^\d{4}-\d{2}-\d{2}$/);
});
