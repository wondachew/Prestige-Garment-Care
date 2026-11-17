import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { CART_COOKIE, DISCOUNT_COOKIE, parseCart, MAX_NOTE } from "@/lib/cart";
import { formatEtb, computeTotals } from "@/lib/money";
import { findDiscount } from "@/lib/orders";
import { changeCartLineAction, applyDiscountAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your cart" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const db = getDb();
  const items = parseCart(jar.get(CART_COOKIE)?.value);
  const lines = items
    .map((i) => {
      const svc = db.prepare("SELECT id, name, price_etb, turnaround_days FROM services WHERE id = ? AND active = 1").get(i.serviceId) as
        | { id: number; name: string; price_etb: number; turnaround_days: number }
        | undefined;
      return svc ? { ...i, svc } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const code = jar.get(DISCOUNT_COOKIE)?.value ?? "";
  const discount = code ? findDiscount(db, code) : null;
  const totals = computeTotals(lines.map((l) => ({ unitPrice: l.svc.price_etb, quantity: l.quantity })), 0, discount?.discount ?? null);

  return (
    <section>
      <div className="container pad-bottom">
        <p className="eyebrow">Cart</p>
        <h1>Your garments</h1>
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        {sp.ok ? <div className="alert ok">{sp.ok}</div> : null}
        {lines.length === 0 ? (
          <div className="card">
            <p>Your cart is empty.</p>
            <Link className="btn btn-gold" href="/services">Browse services</Link>
          </div>
        ) : (
          <div className="two-col">
            <div>
              {lines.map((l) => (
                <div className="card" key={l.serviceId} style={{ marginBottom: 14 }}>
                  <div className="inline" style={{ justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0 }}>{l.svc.name}</h3>
                    <span className="price">{formatEtb(l.svc.price_etb * l.quantity)}</span>
                  </div>
                  <p className="muted" style={{ margin: "4px 0 12px" }}>{formatEtb(l.svc.price_etb)} each · about {l.svc.turnaround_days} working day(s)</p>
                  <form action={changeCartLineAction} className="field">
                    <input type="hidden" name="serviceId" value={l.serviceId} />
                    <div className="inline tight">
                      <label htmlFor={`qty-${l.serviceId}`} className="sans">Qty</label>
                      <input id={`qty-${l.serviceId}`} className="qty" type="number" name="quantity" min={1} max={50} defaultValue={l.quantity} />
                    </div>
                    <label htmlFor={`notes-${l.serviceId}`}>Care instructions, stains or damage notes</label>
                    <textarea id={`notes-${l.serviceId}`} name="careNotes" maxLength={MAX_NOTE} defaultValue={l.careNotes} placeholder="e.g. coffee stain on left cuff; please use gentle cleaning" />
                    <div className="inline">
                      <button className="btn btn-navy btn-sm" type="submit">Save changes</button>
                    </div>
                  </form>
                  <form action={changeCartLineAction}>
                    <input type="hidden" name="serviceId" value={l.serviceId} />
                    <input type="hidden" name="intent" value="remove" />
                    <button className="btn btn-ghost btn-sm" type="submit">Remove</button>
                  </form>
                </div>
              ))}
            </div>

            <aside>
              <div className="panel summary">
                <h3>Order summary</h3>
                <form action={applyDiscountAction} className="field">
                  <label htmlFor="discountCode">Discount code</label>
                  <div className="inline">
                    <input id="discountCode" name="discountCode" defaultValue={code} placeholder="e.g. WELCOME10" style={{ textTransform: "uppercase" }} />
                    <button className="btn btn-ghost btn-sm" type="submit">Apply</button>
                  </div>
                  {code && !discount ? <small style={{ color: "var(--danger)" }}>The saved code is no longer valid.</small> : null}
                </form>
                <dl>
                  <dt>Garments subtotal</dt><dd>{formatEtb(totals.subtotal)}</dd>
                  <dt>Discount</dt><dd>{totals.discount ? `− ${formatEtb(totals.discount)}` : "—"}</dd>
                  <dt>Delivery</dt><dd className="muted">Set by zone at checkout</dd>
                  <dt className="total">Subtotal before delivery</dt><dd className="total">{formatEtb(totals.subtotal - totals.discount)}</dd>
                </dl>
                <p className="muted" style={{ fontSize: ".9rem" }}>The final amount, including your delivery zone fee, is shown before you confirm.</p>
                <Link className="btn btn-gold" href="/checkout" style={{ width: "100%" }}>Continue to checkout</Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
