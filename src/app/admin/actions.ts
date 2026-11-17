"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, tx } from "@/lib/db";
import { ADMIN_COOKIE, ADMIN_SESSION_MAX_AGE, checkAdminPassword, issueAdminToken, adminConfigured } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin-guard";
import { audit, recordPayment, setOrderStatus, updateOrderOps, ValidationError, type PaymentInput } from "@/lib/orders";
import { setSetting } from "@/lib/settings";
import { isOrderStatus } from "@/lib/status";
import { activateSubscription, attachOrderToSubscription, detachOrderFromSubscription } from "@/lib/subscriptions";

const ACTOR = "admin";

function msg(path: string, kind: "ok" | "error", text: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);
}

function intField(formData: FormData, name: string, fallback = 0): number {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return fallback;
  return Math.round(Number(raw));
}

export async function loginAction(formData: FormData): Promise<void> {
  if (!adminConfigured()) redirect("/admin/login?error=Admin+is+not+configured.+Set+ADMIN_PASSWORD+and+SESSION_SECRET.");
  if (!checkAdminPassword(String(formData.get("password") ?? ""))) {
    redirect("/admin/login?error=Incorrect+password.");
  }
  (await cookies()).set(ADMIN_COOKIE, issueAdminToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

export async function setStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderId = Number(formData.get("orderId"));
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "");
  try {
    if (!isOrderStatus(status)) throw new ValidationError("Unknown status.");
    setOrderStatus(getDb(), orderId, status, note, ACTOR);
  } catch (e) {
    if (e instanceof ValidationError) msg(`/admin/orders/${orderId}`, "error", e.message);
    throw e;
  }
  msg(`/admin/orders/${orderId}`, "ok", "Status updated.");
}

export async function updateOpsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderId = Number(formData.get("orderId"));
  const courier = Number(formData.get("courierId") || 0);
  const partner = Number(formData.get("cleaningPartnerId") || 0);
  try {
    updateOrderOps(
      getDb(),
      orderId,
      {
        courierId: courier || null,
        cleaningPartnerId: partner || null,
        cleaningCost: intField(formData, "cleaningCost"),
        courierCost: intField(formData, "courierCost"),
        packagingCost: intField(formData, "packagingCost"),
      },
      ACTOR,
    );
  } catch (e) {
    if (e instanceof ValidationError) msg(`/admin/orders/${orderId}`, "error", e.message);
    throw e;
  }
  msg(`/admin/orders/${orderId}`, "ok", "Assignments and costs saved.");
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderId = Number(formData.get("orderId"));
  try {
    const input: PaymentInput = {
      method: String(formData.get("method") ?? ""),
      amount: intField(formData, "amount"),
      reference: String(formData.get("reference") ?? ""),
      status: String(formData.get("status") ?? "paid") as PaymentInput["status"],
    };
    recordPayment(getDb(), orderId, input, ACTOR);
  } catch (e) {
    if (e instanceof ValidationError) msg(`/admin/orders/${orderId}`, "error", e.message);
    throw e;
  }
  msg(`/admin/orders/${orderId}`, "ok", "Payment recorded.");
}

/** Saves all catalogue rows at once: price, turnaround, active flag; plan prices and details. */
export async function saveCatalogueAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  try {
    tx(db, () => {
      const services = db.prepare("SELECT id, price_etb, turnaround_days, active FROM services").all() as {
        id: number; price_etb: number; turnaround_days: number; active: number;
      }[];
      for (const s of services) {
        const price = formData.get(`price_${s.id}`);
        if (price === null) continue;
        const newPrice = Math.round(Number(price));
        const newDays = intField(formData, `days_${s.id}`, s.turnaround_days);
        const active = formData.get(`active_${s.id}`) === "on" ? 1 : 0;
        if (!Number.isInteger(newPrice) || newPrice < 0) throw new ValidationError("Prices must be whole ETB amounts of zero or more.");
        if (newPrice !== s.price_etb || newDays !== s.turnaround_days || active !== s.active) {
          db.prepare("UPDATE services SET price_etb = ?, turnaround_days = ?, active = ?, updated_at = datetime('now') WHERE id = ?").run(newPrice, newDays, active, s.id);
          audit(db, ACTOR, "service.update", `service ${s.id} price ${s.price_etb}->${newPrice}`);
        }
      }
      const plans = db.prepare("SELECT id, price_etb FROM subscription_plans").all() as { id: number; price_etb: number }[];
      for (const p of plans) {
        const raw = formData.get(`planprice_${p.id}`);
        if (raw === null) continue;
        const newPrice = Math.round(Number(raw));
        if (!Number.isInteger(newPrice) || newPrice < 0) throw new ValidationError("Plan prices must be whole ETB amounts.");
        if (newPrice !== p.price_etb) {
          db.prepare("UPDATE subscription_plans SET price_etb = ? WHERE id = ?").run(newPrice, p.id);
          audit(db, ACTOR, "plan.update", `plan ${p.id} price ${p.price_etb}->${newPrice}`);
        }
      }
    });
  } catch (e) {
    if (e instanceof ValidationError) msg("/admin/catalogue", "error", e.message);
    throw e;
  }
  msg("/admin/catalogue", "ok", "Catalogue saved. Existing orders keep their original prices.");
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const number = String(formData.get("whatsapp_number") ?? "").trim();
  if (number && !/^\+?\d{8,15}$/.test(number.replace(/[\s-]/g, ""))) {
    msg("/admin/settings", "error", "WhatsApp number must include the country code, e.g. +251 9XX XXX XXX.");
  }
  setSetting(db, "business_name", String(formData.get("business_name") ?? "").trim() || "Executive Suit Care");
  setSetting(db, "whatsapp_number", number.replace(/[\s-]/g, ""));
  setSetting(db, "business_phone", String(formData.get("business_phone") ?? "").trim());
  setSetting(db, "business_email", String(formData.get("business_email") ?? "").trim());
  setSetting(db, "collection_windows", JSON.stringify(String(formData.get("collection_windows") ?? "").split("\n").map((s) => s.trim()).filter(Boolean)));
  audit(db, ACTOR, "settings.update", "business settings");
  msg("/admin/settings", "ok", "Settings saved.");
}

export async function saveZonesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const zones = db.prepare("SELECT id, fee_etb FROM delivery_zones").all() as { id: number; fee_etb: number }[];
  for (const z of zones) {
    const fee = formData.get(`fee_${z.id}`);
    if (fee === null) continue;
    const newFee = Math.round(Number(fee));
    if (!Number.isInteger(newFee) || newFee < 0) msg("/admin/settings", "error", "Delivery fees must be whole ETB amounts.");
    db.prepare("UPDATE delivery_zones SET fee_etb = ?, active = ? WHERE id = ?").run(newFee, formData.get(`zone_${z.id}`) === "on" ? 1 : 0, z.id);
  }
  const newZone = String(formData.get("new_zone") ?? "").trim();
  if (newZone) {
    const fee = intField(formData, "new_zone_fee", -1);
    if (fee < 0) msg("/admin/settings", "error", "Enter a delivery fee for the new zone.");
    try {
      db.prepare("INSERT INTO delivery_zones (name, fee_etb) VALUES (?, ?)").run(newZone, fee);
    } catch {
      msg("/admin/settings", "error", "That zone already exists.");
    }
  }
  audit(db, ACTOR, "zones.update", "delivery zones");
  msg("/admin/settings", "ok", "Delivery zones saved.");
}

export async function addPersonAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const kind = String(formData.get("kind"));
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) msg("/admin/settings", "error", "Name is required.");
  if (kind === "courier") {
    if (!phone) msg("/admin/settings", "error", "Courier phone is required.");
    db.prepare("INSERT INTO couriers (name, phone) VALUES (?, ?)").run(name, phone);
  } else if (kind === "partner") {
    db.prepare("INSERT INTO cleaning_partners (name, phone, address) VALUES (?, ?, ?)").run(name, phone, String(formData.get("address") ?? "").trim());
  } else {
    msg("/admin/settings", "error", "Unknown record type.");
  }
  audit(db, ACTOR, `${kind}.create`, name);
  msg("/admin/settings", "ok", `${kind === "courier" ? "Courier" : "Cleaning partner"} added.`);
}

export async function addDiscountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const kind = String(formData.get("kind"));
  const value = intField(formData, "value");
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) msg("/admin/settings", "error", "Codes must be 3–20 letters, numbers, - or _.");
  if (kind !== "percent" && kind !== "fixed") msg("/admin/settings", "error", "Choose percent or fixed.");
  if (kind === "percent" && (value < 1 || value > 100)) msg("/admin/settings", "error", "Percent discounts must be 1–100.");
  if (value < 1) msg("/admin/settings", "error", "Discount value must be positive.");
  try {
    db.prepare("INSERT INTO discounts (code, kind, value) VALUES (?, ?, ?)").run(code, kind, value);
  } catch {
    msg("/admin/settings", "error", "That code already exists.");
  }
  audit(db, ACTOR, "discount.create", code);
  msg("/admin/settings", "ok", "Discount code added.");
}

export async function activateSubscriptionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  try {
    activateSubscription(
      getDb(),
      {
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        planId: Number(formData.get("planId")),
        startsOn: String(formData.get("startsOn") ?? ""),
      },
      ACTOR,
    );
  } catch (e) {
    if (e instanceof ValidationError) msg("/admin/subscriptions", "error", e.message);
    throw e;
  }
  msg("/admin/subscriptions", "ok", "Subscription activated. Confirm the payment separately on the order or in the payment ledger.");
}

export async function attachOrderAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const orderNo = String(formData.get("orderNo") ?? "").trim();
  const order = db.prepare("SELECT id FROM orders WHERE order_no = ?").get(orderNo) as { id: number } | undefined;
  if (!order) msg("/admin/subscriptions", "error", "No order with that number.");
  try {
    attachOrderToSubscription(db, order.id, Number(formData.get("subscriptionId")), formData.get("approve") === "on", ACTOR);
  } catch (e) {
    if (e instanceof ValidationError) msg("/admin/subscriptions", "error", e.message);
    throw e;
  }
  msg("/admin/subscriptions", "ok", "Order attached to subscription.");
}

export async function detachOrderAction(formData: FormData): Promise<void> {
  await requireAdmin();
  try {
    detachOrderFromSubscription(getDb(), Number(formData.get("orderId")), ACTOR);
  } catch (e) {
    if (e instanceof ValidationError) msg("/admin/subscriptions", "error", e.message);
    throw e;
  }
  msg("/admin/subscriptions", "ok", "Order detached from subscription.");
}
