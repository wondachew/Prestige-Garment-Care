import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer-guard";
import { getDb } from "@/lib/db";
import { formatEtb } from "@/lib/money";
import { STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/status";
import { listAddresses, listCustomerOrders } from "@/lib/accounts";
import { logoutAction, addAddressAction, deleteAddressAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireCustomer();
  const sp = await searchParams;
  const db = getDb();
  const orders = listCustomerOrders(db, me.id);
  const addresses = listAddresses(db, me.id);
  const subs = db
    .prepare(
      `SELECT s.status, s.starts_on, s.expires_on, s.suits_used, s.shirts_used, p.name AS plan_name, p.suit_allowance, p.shirt_allowance
       FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.customer_id = ? ORDER BY s.id DESC`,
    )
    .all(me.id) as { status: string; starts_on: string; expires_on: string; suits_used: number; shirts_used: number; plan_name: string; suit_allowance: number; shirt_allowance: number }[];

  return (
    <section>
      <div className="container pad-bottom">
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div><p className="eyebrow">Your account</p><h1 style={{ marginBottom: 4 }}>Hello {me.name.split(" ")[0]}</h1><p className="muted">{me.phone}</p></div>
          <div className="inline">
            <Link className="btn btn-gold btn-sm" href="/services">Order garments</Link>
            <form action={logoutAction}><button className="btn btn-ghost btn-sm" type="submit">Log out</button></form>
          </div>
        </div>
        {sp.ok ? <div className="alert ok">{sp.ok}</div> : null}
        {sp.error ? <div className="alert error">{sp.error}</div> : null}

        <div className="two-col">
          <div>
            <div className="panel">
              <h3>Your orders</h3>
              {orders.length === 0 ? (
                <p className="muted">No orders yet. <Link href="/services">Browse services</Link>.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Order</th><th>Collect on</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td><Link href={`/order/${o.order_no}?t=${o.tracking_token}`}>{o.order_no}</Link></td>
                          <td>{o.preferred_collection_date}</td>
                          <td><span className="pill">{STATUS_LABELS[o.status as keyof typeof STATUS_LABELS] ?? o.status}</span></td>
                          <td>{PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}</td>
                          <td>{formatEtb(o.total_etb)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="panel">
              <h3>Subscription</h3>
              {subs.length === 0 ? (
                <p className="muted">No subscription yet. <Link href="/#subscriptions">See the monthly packages</Link>.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {subs.slice(0, 3).map((s, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>
                      <strong>{s.plan_name}</strong> — <span className={`pill ${s.status === "active" ? "ok" : ""}`}>{s.status}</span>
                      <div className="muted" style={{ fontSize: ".9rem" }}>
                        {s.starts_on} to {s.expires_on} · suits {s.suits_used}/{s.suit_allowance} · shirts or blouses {s.shirts_used}/{s.shirt_allowance}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside>
            <div className="panel">
              <h3>Saved addresses</h3>
              {addresses.length === 0 ? <p className="muted">No saved addresses yet.</p> : (
                <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                  {addresses.map((a) => (
                    <li key={a.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
                      <strong>{a.label}</strong>
                      <div className="muted" style={{ fontSize: ".92rem" }}>{a.address_text}{a.sub_city ? `, ${a.sub_city}` : ""}{a.landmark ? ` · ${a.landmark}` : ""}</div>
                      <form action={deleteAddressAction} style={{ marginTop: 8 }}>
                        <input type="hidden" name="addressId" value={a.id} />
                        <button className="btn btn-ghost btn-sm" type="submit">Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addAddressAction}>
                <div className="field"><label htmlFor="label">Label</label><input id="label" name="label" placeholder="Office, Home" /></div>
                <div className="field"><label htmlFor="addressText">Address</label><input id="addressText" name="addressText" required minLength={5} placeholder="Building, street" /></div>
                <div className="row2">
                  <div className="field"><label htmlFor="subCity">Sub-city</label><input id="subCity" name="subCity" /></div>
                  <div className="field"><label htmlFor="landmark">Landmark</label><input id="landmark" name="landmark" /></div>
                </div>
                <input type="hidden" name="building" value="" />
                <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Save address</button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
