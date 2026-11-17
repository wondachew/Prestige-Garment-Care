import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db";
import { createOrder, getOrderByNumber, ValidationError, type NewOrderInput } from "../src/lib/orders";
import {
  activateSubscription,
  addDaysIso,
  attachOrderToSubscription,
  countOrderUsage,
  detachOrderFromSubscription,
  expiringSubscriptions,
} from "../src/lib/subscriptions";

const OWNER = "0911000111";
const NOW = new Date("2099-01-01T06:00:00Z");
const START = "2099-01-10";
const COLLECT = "2099-01-15";

function svcId(db: Db, name: string): number {
  return (db.prepare("SELECT id FROM services WHERE name = ?").get(name) as { id: number }).id;
}

function orderWith(db: Db, phone: string, items: { name: string; qty: number }[], collect = COLLECT): number {
  const zone = db.prepare("SELECT id FROM delivery_zones WHERE name = 'Bole'").get() as { id: number };
  const input: NewOrderInput = {
    customerName: "Sub Tester",
    phone,
    email: null,
    collectionAddress: "Bole Atlas, Office 4",
    zoneId: zone.id,
    deliveryAddress: "Bole Atlas, Office 4",
    collectionDate: collect,
    collectionWindow: "Morning (08:00–12:00)",
    deliveryDate: null,
    deliveryInstructions: "",
    paymentMethod: "bank_transfer",
    discountCode: null,
    items: items.map((i) => ({ serviceId: svcId(db, i.name), quantity: i.qty, careNotes: "" })),
  };
  const res = createOrder(db, input, NOW);
  return (getOrderByNumber(db, res.orderNo) as { id: number }).id;
}

function setup() {
  const db = openDatabase(":memory:");
  const starterPlan = (db.prepare("SELECT id FROM subscription_plans WHERE name = 'Executive Starter'").get() as { id: number }).id;
  const subId = activateSubscription(db, { name: "Sub Tester", phone: OWNER, planId: starterPlan, startsOn: START }, "admin");
  return { db, subId };
}

const usedOf = (db: Db, subId: number) => ({
  ...(db.prepare("SELECT suits_used, shirts_used FROM subscriptions WHERE id = ?").get(subId) as { suits_used: number; shirts_used: number }),
});
const totalOf = (db: Db, orderId: number) =>
  (db.prepare("SELECT total_etb FROM orders WHERE id = ?").get(orderId) as { total_etb: number }).total_etb;

test("period is 30 days from start", () => {
  assert.equal(addDaysIso("2099-01-10", 30), "2099-02-09");
});

test("usage counts only suit and shirt categories", () => {
  const { db } = setup();
  const id = orderWith(db, OWNER, [
    { name: "Men's two-piece suit", qty: 2 },
    { name: "Dress shirt", qty: 1 },
    { name: "Tie", qty: 3 },
  ]);
  assert.deepEqual(countOrderUsage(db, id), { suits: 2, shirts: 1 });
});

test("within allowance: garments are credited and the order total drops accordingly", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Men's two-piece suit", qty: 2 }, { name: "Dress shirt", qty: 2 }]);
  // Subtotal 2*900 + 2*150 = 2100, fee 150 → 2250 before subscription
  assert.equal(totalOf(db, id), 2250);
  attachOrderToSubscription(db, id, subId, false, "admin");
  // Starter covers 2 suits + 2 shirts = 2100 credit → total only the 150 delivery fee
  assert.equal(totalOf(db, id), 150);
  assert.deepEqual(usedOf(db, subId), { suits_used: 2, shirts_used: 2 });
});

test("overage is charged at catalogue price without approval", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Men's two-piece suit", qty: 3 }]);
  attachOrderToSubscription(db, id, subId, false, "admin");
  // Starter allows 2 suits: 2 credited (1800), 1 charged (900) + fee 150 = 1050
  assert.equal(totalOf(db, id), 1050);
  assert.deepEqual(usedOf(db, subId), { suits_used: 2, shirts_used: 0 });
});

test("admin approval waives overage and is recorded on the order", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Men's two-piece suit", qty: 3 }]);
  attachOrderToSubscription(db, id, subId, true, "admin");
  assert.equal(totalOf(db, id), 150);
  const row = db.prepare("SELECT subscription_approved FROM orders WHERE id = ?").get(id) as { subscription_approved: number };
  assert.equal(row.subscription_approved, 1);
});

test("second attachment of the same order is refused", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Dress shirt", qty: 1 }]);
  attachOrderToSubscription(db, id, subId, false, "admin");
  assert.throws(() => attachOrderToSubscription(db, id, subId, false, "admin"), ValidationError);
});

test("collection date outside the subscription period is refused", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Dress shirt", qty: 1 }], "2099-03-01");
  assert.throws(() => attachOrderToSubscription(db, id, subId, false, "admin"), /outside this subscription period/);
});

test("another customer's order cannot use this subscription", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Dress shirt", qty: 1 }]);
  // Different customer phone
  const other = orderWith(db, "0911000999", [{ name: "Dress shirt", qty: 1 }]);
  attachOrderToSubscription(db, id, subId, false, "admin");
  assert.throws(() => attachOrderToSubscription(db, other, subId, false, "admin"), /different customer/);
});

test("detach restores allowance and the full price", () => {
  const { db, subId } = setup();
  const id = orderWith(db, OWNER, [{ name: "Men's two-piece suit", qty: 2 }]);
  const before = totalOf(db, id);
  attachOrderToSubscription(db, id, subId, false, "admin");
  detachOrderFromSubscription(db, id, "admin");
  assert.equal(totalOf(db, id), before);
  assert.deepEqual(usedOf(db, subId), { suits_used: 0, shirts_used: 0 });
});

test("re-activating replaces the previous active subscription", () => {
  const { db, subId } = setup();
  const plan = (db.prepare("SELECT id FROM subscription_plans WHERE name = 'Executive Premium'").get() as { id: number }).id;
  const newId = activateSubscription(db, { name: "Sub Tester", phone: OWNER, planId: plan, startsOn: START }, "admin");
  const old = db.prepare("SELECT status FROM subscriptions WHERE id = ?").get(subId) as { status: string };
  assert.equal(old.status, "expired");
  assert.equal(expiringSubscriptions(db, "2099-02-05").some((s) => s.id === newId), true);
});

test("invalid activation inputs are refused", () => {
  const { db } = setup();
  const plan = (db.prepare("SELECT id FROM subscription_plans LIMIT 1").get() as { id: number }).id;
  assert.throws(() => activateSubscription(db, { name: "X", phone: "0911000000", planId: plan, startsOn: START }, "admin"), ValidationError);
  assert.throws(() => activateSubscription(db, { name: "Valid Name", phone: "bad", planId: plan, startsOn: START }, "admin"), ValidationError);
  assert.throws(() => activateSubscription(db, { name: "Valid Name", phone: "0911000000", planId: 9999, startsOn: START }, "admin"), ValidationError);
});
