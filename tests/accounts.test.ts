import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db";
import { createOrder, getOrderByNumber, ValidationError, type NewOrderInput } from "../src/lib/orders";
import { hashPassword, verifyPassword, issueCustomerToken, verifyCustomerToken, passwordError } from "../src/lib/customer-auth";
import { registerCustomer, loginCustomer, isLoginBlocked, addAddress, listAddresses, deleteAddress, listCustomerOrders, resetFailures } from "../src/lib/accounts";
import { activateSubscription } from "../src/lib/subscriptions";

beforeEach(() => {
  process.env.SESSION_SECRET = "s".repeat(40);
});

const NOW = new Date("2099-01-01T06:00:00Z");

function orderInput(db: Db, phone: string, accountCustomerId?: number | null): NewOrderInput {
  const zone = db.prepare("SELECT id FROM delivery_zones WHERE name = 'Bole'").get() as { id: number };
  const shirt = db.prepare("SELECT id FROM services WHERE name = 'Dress shirt'").get() as { id: number };
  return {
    customerName: "Abebe Kebede",
    phone,
    email: null,
    collectionAddress: "Bole Atlas, Office 4",
    zoneId: zone.id,
    deliveryAddress: "Bole Atlas, Office 4",
    collectionDate: "2099-01-15",
    collectionWindow: "Morning (08:00–12:00)",
    deliveryDate: null,
    deliveryInstructions: "",
    paymentMethod: "telebirr",
    discountCode: null,
    items: [{ serviceId: shirt.id, quantity: 1, careNotes: "" }],
    accountCustomerId,
  };
}

test("password hashing round-trips and rejects wrong passwords", () => {
  const stored = hashPassword("correct horse");
  assert.match(stored, /^scrypt\$/);
  assert.equal(verifyPassword("correct horse", stored), true);
  assert.equal(verifyPassword("wrong horse", stored), false);
  assert.equal(verifyPassword("anything", null), false);
  assert.notEqual(hashPassword("same"), hashPassword("same"));
});

test("password policy", () => {
  assert.ok(passwordError("short"));
  assert.equal(passwordError("long enough"), null);
});

test("customer tokens verify, reject tampering and expire", () => {
  const t = issueCustomerToken(42, 1_000_000);
  assert.equal(verifyCustomerToken(t, 1_000_001), 42);
  assert.equal(verifyCustomerToken(t, 1_000_000 + 31 * 24 * 3600 * 1000), null);
  const [id, exp, sig] = t.split(".");
  assert.equal(verifyCustomerToken(`43.${exp}.${sig}`, 1_000_001), null);
  assert.equal(verifyCustomerToken(`${id}.${exp}.${"0".repeat(sig.length)}`, 1_000_001), null);
  assert.equal(verifyCustomerToken(undefined), null);
});

test("registration creates an account and refuses duplicates", () => {
  const db = openDatabase(":memory:");
  const id = registerCustomer(db, { name: "Selam Tesfaye", phone: "0911 555 666", email: "", password: "password123" });
  assert.ok(id > 0);
  assert.throws(() => registerCustomer(db, { name: "Other", phone: "+251911555666", email: "", password: "password123" }), /already exists/);
});

test("guest orders are not visible to a later registration on the same number", () => {
  const db = openDatabase(":memory:");
  createOrder(db, orderInput(db, "0911 777 888"), NOW);
  const id = registerCustomer(db, { name: "Someone Else", phone: "0911777888", email: "", password: "password123" });
  assert.equal(listCustomerOrders(db, id).length, 0);
});

test("numbers already tied to a subscriber or account are not claimable by registration", () => {
  const db = openDatabase(":memory:");
  const plan = (db.prepare("SELECT id FROM subscription_plans WHERE name = 'Executive Starter'").get() as { id: number }).id;
  activateSubscription(db, { name: "Sub Person", phone: "0911 300 300", planId: plan, startsOn: "2099-01-10" }, "admin");
  assert.throws(
    () => registerCustomer(db, { name: "Imposter", phone: "0911300300", email: "", password: "password123" }),
    /already on our records/,
  );
});

test("login works with the right password and throttles repeated failures", () => {
  const db = openDatabase(":memory:");
  const id = registerCustomer(db, { name: "Login Test", phone: "0911 000 123", email: "", password: "password123" });
  assert.equal(loginCustomer(db, "+251911000123", "password123"), id);
  resetFailures("+251911000123");
  for (let i = 0; i < 5; i++) assert.throws(() => loginCustomer(db, "0911000123", "bad-guess"), /incorrect/);
  assert.equal(isLoginBlocked("+251911000123"), true);
  assert.throws(() => loginCustomer(db, "0911000123", "password123"), /Too many attempts/);
  resetFailures("+251911000123");
});

test("unknown number gets the same generic error as a wrong password", () => {
  const db = openDatabase(":memory:");
  assert.throws(() => loginCustomer(db, "0911999999", "whatever123"), /Phone number or password is incorrect/);
  resetFailures("+251911999999");
});

test("account orders are linked only when placed with the account's own number", () => {
  const db = openDatabase(":memory:");
  const id = registerCustomer(db, { name: "Owner", phone: "0911 333 444", email: "", password: "password123" });
  const mine = createOrder(db, orderInput(db, "0911333444", id), NOW);
  const guest = createOrder(db, orderInput(db, "0911333444", null), NOW);
  const linked = (getOrderByNumber(db, mine.orderNo) as { customer_id: number | null }).customer_id;
  const unlinked = (getOrderByNumber(db, guest.orderNo) as { customer_id: number | null }).customer_id;
  assert.equal(linked, id);
  assert.equal(unlinked, null);
  assert.equal(listCustomerOrders(db, id).length, 1);
});

test("an account cannot place an order for a different number", () => {
  const db = openDatabase(":memory:");
  const id = registerCustomer(db, { name: "Owner", phone: "0911 333 445", email: "", password: "password123" });
  assert.throws(() => createOrder(db, orderInput(db, "0911 999 000", id), NOW), /mobile number on your account/);
});

test("saved addresses are per customer and deletable only by their owner", () => {
  const db = openDatabase(":memory:");
  const a = registerCustomer(db, { name: "A Person", phone: "0911 100 200", email: "", password: "password123" });
  const b = registerCustomer(db, { name: "B Person", phone: "0911 100 201", email: "", password: "password123" });
  addAddress(db, a, { label: "Office", subCity: "Bole", building: "Atlas", landmark: "", addressText: "Bole Atlas, Office 4" });
  assert.equal(listAddresses(db, a).length, 1);
  assert.equal(listAddresses(db, b).length, 0);
  const addrId = listAddresses(db, a)[0].id;
  deleteAddress(db, b, addrId);
  assert.equal(listAddresses(db, a).length, 1);
  deleteAddress(db, a, addrId);
  assert.equal(listAddresses(db, a).length, 0);
});

test("address text must be meaningful", () => {
  const db = openDatabase(":memory:");
  const a = registerCustomer(db, { name: "A Person", phone: "0911 100 300", email: "", password: "password123" });
  assert.throws(() => addAddress(db, a, { label: "x", subCity: "", building: "", landmark: "", addressText: "abc" }), ValidationError);
});
