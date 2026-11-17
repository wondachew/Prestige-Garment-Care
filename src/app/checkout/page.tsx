import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { CART_COOKIE, DISCOUNT_COOKIE, parseCart } from "@/lib/cart";
import { formatEtb, computeTotals } from "@/lib/money";
import { findDiscount, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/orders";
import { getCollectionWindows } from "@/lib/settings";
import { placeOrderAction } from "../actions";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const db = getDb();
  const items = parseCart(jar.get(CART_COOKIE)?.value);
  const lines = items
    .map((i) => {
      const svc = db.prepare("SELECT id, name, price_etb FROM services WHERE id = ? AND active = 1").get(i.serviceId) as
        | { id: number; name: string; price_etb: number }
        | undefined;
      return svc ? { ...i, svc } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const zones = db.prepare("SELECT id, name, fee_etb FROM delivery_zones WHERE active = 1 ORDER BY name").all() as { id: number; name: string; fee_etb: number }[];
  const windows = getCollectionWindows(db);
  const code = jar.get(DISCOUNT_COOKIE)?.value ?? null;
  const discount = code ? findDiscount(db, code)?.discount ?? null : null;

  if (lines.length === 0) {
    return (
      <section>
        <div className="container">
          <h1>Checkout</h1>
          <div className="card"><p>Your cart is empty.</p><Link className="btn btn-gold" href="/services">Browse services</Link></div>
        </div>
      </section>
    );
  }

  const subtotal = computeTotals(lines.map((l) => ({ unitPrice: l.svc.price_etb, quantity: l.quantity })), 0, discount).subtotal;
  const discountAmount = computeTotals(lines.map((l) => ({ unitPrice: l.svc.price_etb, quantity: l.quantity })), 0, discount).discount;

  return (
    <section>
      <div className="container pad-bottom">
        <p className="eyebrow">Checkout</p>
        <h1>Confirm your collection</h1>
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        <div className="two-col">
          <form action={placeOrderAction} className="panel">
            <h3>Your details</h3>
            <div className="row2">
              <div className="field"><label htmlFor="customerName">Full name</label><input id="customerName" name="customerName" required autoComplete="name" minLength={2} /></div>
              <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="0911 234 567 or +251 911 234 567" /></div>
            </div>
            <div className="field"><label htmlFor="email">Email <small>(optional)</small></label><input id="email" name="email" type="email" autoComplete="email" /></div>

            <h3 style={{ marginTop: 22 }}>Collection</h3>
            <div className="field"><label htmlFor="collectionAddress">Collection address</label><input id="collectionAddress" name="collectionAddress" required placeholder="Building or office name, street, sub-city" /></div>
            <div className="row2">
              <div className="field"><label htmlFor="zoneId">Sub-city / delivery zone</label>
                <select id="zoneId" name="zoneId" required defaultValue={zones[0]?.id}>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — delivery {formatEtb(z.fee_etb)}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="landmark">Landmark <small>(optional, add to address)</small></label><input id="landmark" name="landmark" placeholder="e.g. next to the bank" /></div>
            </div>
            <div className="row2">
              <div className="field"><label htmlFor="collectionDate">Preferred collection date</label><input id="collectionDate" name="collectionDate" type="date" required /></div>
              <div className="field"><label htmlFor="collectionWindow">Preferred time window</label>
                <select id="collectionWindow" name="collectionWindow" required>
                  {windows.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            <h3 style={{ marginTop: 22 }}>Return delivery</h3>
            <label className="inline" style={{ marginBottom: 10 }}>
              <input type="checkbox" name="deliverySameAsCollection" defaultChecked style={{ width: 20, minHeight: 20 }} /> Deliver to the same address
            </label>
            <div className="field"><label htmlFor="deliveryAddress">Delivery address <small>(if different)</small></label><input id="deliveryAddress" name="deliveryAddress" placeholder="Leave blank if same as collection" /></div>
            <div className="row2">
              <div className="field"><label htmlFor="deliveryDate">Preferred return date <small>(optional)</small></label><input id="deliveryDate" name="deliveryDate" type="date" /></div>
              <div className="field"><label htmlFor="deliveryInstructions">Delivery instructions</label><input id="deliveryInstructions" name="deliveryInstructions" placeholder="Reception, gate code, etc." /></div>
            </div>

            <h3 style={{ marginTop: 22 }}>Payment</h3>
            <div className="field"><label htmlFor="paymentMethod">Payment method</label>
              <select id="paymentMethod" name="paymentMethod" required>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
              </select>
              <small>Online payments are verified by our team. You will receive payment instructions on your order page.</small>
            </div>
            <input type="hidden" name="discountCode" value={code ?? ""} />

            <button className="btn btn-gold" type="submit" style={{ width: "100%", marginTop: 8 }}>Place order</button>
          </form>

          <aside className="panel summary">
            <h3>Order summary</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 12px" }}>
              {lines.map((l) => (
                <li key={l.serviceId} style={{ marginBottom: 6 }}>
                  {l.quantity} × {l.svc.name} <span className="muted">({formatEtb(l.svc.price_etb * l.quantity)})</span>
                  {l.careNotes ? <div className="muted" style={{ fontSize: ".88rem" }}>Note: {l.careNotes}</div> : null}
                </li>
              ))}
            </ul>
            <dl>
              <dt>Garments subtotal</dt><dd>{formatEtb(subtotal)}</dd>
              <dt>Discount{code ? ` (${code})` : ""}</dt><dd>{discountAmount ? `− ${formatEtb(discountAmount)}` : "—"}</dd>
              <dt>Delivery fee</dt><dd className="muted">Per zone, shown above</dd>
            </dl>
            <p className="muted" style={{ fontSize: ".9rem" }}>Your final total is confirmed on your order page.</p>
            <Link href="/cart" className="btn btn-ghost btn-sm">Edit cart</Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
