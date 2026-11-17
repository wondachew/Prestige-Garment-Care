import type { Db } from "./db";
import { audit, ValidationError } from "./orders";
import { normalizeEthiopianMobile } from "./phone";
import { hashPassword, passwordError, verifyPassword } from "./customer-auth";

// Simple in-memory login throttle: 5 failures per number per 15 minutes.
// Per-process only; move to shared storage before running more than one instance.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

export function isLoginBlocked(key: string, now = Date.now()): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (now - f.first > LOGIN_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= LOGIN_MAX_FAILURES;
}

function recordFailure(key: string, now = Date.now()): void {
  const f = failures.get(key);
  if (!f || now - f.first > LOGIN_WINDOW_MS) failures.set(key, { count: 1, first: now });
  else f.count += 1;
}

export function resetFailures(key: string): void {
  failures.delete(key);
}

/**
 * Creates an account. A number that already exists (from a guest order, a subscription, or an
 * account) is refused, so a registration can never claim another person's history. Those cases are
 * linked manually by the team until SMS verification exists.
 */
export function registerCustomer(db: Db, input: { name: string; phone: string; email: string; password: string }): number {
  const name = input.name.trim();
  if (name.length < 2) throw new ValidationError("Please enter your full name.");
  const phone = normalizeEthiopianMobile(input.phone);
  if (!phone) throw new ValidationError("Enter a valid Ethiopian mobile number, e.g. 0911 234 567.");
  const email = input.email.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("Enter a valid email address or leave it blank.");
  const pwErr = passwordError(input.password);
  if (pwErr) throw new ValidationError(pwErr);

  const existing = db.prepare("SELECT id, password_hash FROM customers WHERE phone = ?").get(phone) as
    | { id: number; password_hash: string | null }
    | undefined;
  if (existing?.password_hash) throw new ValidationError("An account already exists for this number. Please log in.");
  if (existing) {
    throw new ValidationError("This number is already on our records. Please contact us so we can link it to your new account.");
  }
  const res = db
    .prepare("INSERT INTO customers (name, phone, email, password_hash) VALUES (?, ?, ?, ?)")
    .run(name, phone, email, hashPassword(input.password));
  const id = Number(res.lastInsertRowid);
  audit(db, `customer:${id}`, "account.register", `customer ${id}`);
  return id;
}

export function loginCustomer(db: Db, rawPhone: string, password: string): number {
  const phone = normalizeEthiopianMobile(rawPhone);
  const generic = "Phone number or password is incorrect.";
  if (!phone) throw new ValidationError(generic);
  if (isLoginBlocked(phone)) throw new ValidationError("Too many attempts. Please wait 15 minutes and try again.");
  const row = db.prepare("SELECT id, password_hash FROM customers WHERE phone = ?").get(phone) as
    | { id: number; password_hash: string | null }
    | undefined;
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    recordFailure(phone);
    throw new ValidationError(generic);
  }
  resetFailures(phone);
  audit(db, `customer:${row.id}`, "account.login", `customer ${row.id}`);
  return row.id;
}

export interface AddressRow {
  id: number;
  label: string;
  sub_city: string;
  building: string;
  landmark: string;
  address_text: string;
}

export function listAddresses(db: Db, customerId: number): AddressRow[] {
  return db
    .prepare("SELECT id, label, sub_city, building, landmark, address_text FROM addresses WHERE customer_id = ? ORDER BY id")
    .all(customerId) as unknown as AddressRow[];
}

export function addAddress(
  db: Db,
  customerId: number,
  input: { label: string; subCity: string; building: string; landmark: string; addressText: string },
): void {
  const label = input.label.trim() || "Address";
  const addressText = input.addressText.trim();
  if (addressText.length < 5) throw new ValidationError("Please enter the address.");
  const count = (db.prepare("SELECT COUNT(*) AS n FROM addresses WHERE customer_id = ?").get(customerId) as { n: number }).n;
  if (count >= 10) throw new ValidationError("You can save up to 10 addresses.");
  db.prepare("INSERT INTO addresses (customer_id, label, sub_city, building, landmark, address_text) VALUES (?, ?, ?, ?, ?, ?)").run(
    customerId,
    label.slice(0, 60),
    input.subCity.trim().slice(0, 80),
    input.building.trim().slice(0, 120),
    input.landmark.trim().slice(0, 120),
    addressText.slice(0, 300),
  );
}

export function deleteAddress(db: Db, customerId: number, addressId: number): void {
  db.prepare("DELETE FROM addresses WHERE id = ? AND customer_id = ?").run(addressId, customerId);
}

export function listCustomerOrders(db: Db, customerId: number) {
  return db
    .prepare(
      `SELECT id, order_no, tracking_token, status, payment_status, total_etb, preferred_collection_date
       FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100`,
    )
    .all(customerId) as {
      id: number; order_no: string; tracking_token: string; status: string; payment_status: string; total_etb: number; preferred_collection_date: string;
    }[];
}
