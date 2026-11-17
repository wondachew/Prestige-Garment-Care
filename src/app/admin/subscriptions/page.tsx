import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { formatEtb } from "@/lib/money";
import { listSubscriptions, expiringSubscriptions, PLAN_PERIOD_DAYS } from "@/lib/subscriptions";
import { todayInAddis } from "@/lib/orders";
import { activateSubscriptionAction, attachOrderAction, detachOrderAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscriptions", robots: { index: false } };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const today = todayInAddis();
  const subs = listSubscriptions(db);
  const expiring = expiringSubscriptions(db, today, 7);
  const plans = db.prepare("SELECT id, name, price_etb FROM subscription_plans WHERE active = 1 ORDER BY price_etb").all() as { id: number; name: string; price_etb: number }[];
  const attached = db.prepare(
    `SELECT o.id, o.order_no, o.subscription_id, o.subscription_approved, o.subscription_credit_etb, o.total_etb, o.preferred_collection_date, c.name AS customer
     FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.subscription_id IS NOT NULL ORDER BY o.id DESC LIMIT 50`,
  ).all() as { id: number; order_no: string; subscription_id: number; subscription_approved: number; subscription_credit_etb: number; total_etb: number; preferred_collection_date: string; customer: string }[];

  return (
    <section>
      <div className="container pad-bottom">
        <p><Link href="/admin">← Dashboard</Link></p>
        <h1>Subscriptions</h1>
        <p className="muted">
          Pilot process: confirm the monthly payment in the ledger first, then activate here. Each plan period is {PLAN_PERIOD_DAYS} days.
          Garments within the allowance are credited on the attached order; overage is charged at catalogue price unless you approve a waiver.
        </p>
        {sp.ok ? <div className="alert ok">{sp.ok}</div> : null}
        {sp.error ? <div className="alert error">{sp.error}</div> : null}

        {expiring.length > 0 ? (
          <div className="alert error">Renewal due within 7 days: {expiring.map((s) => `${s.customer_name} (${s.plan_name}, ends ${s.expires_on})`).join("; ")}</div>
        ) : null}

        <div className="two-col">
          <div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Period</th><th>Suits used</th><th>Shirts used</th></tr></thead>
                <tbody>
                  {subs.length === 0 ? <tr><td colSpan={6} className="muted">No subscriptions yet.</td></tr> : subs.map((s) => (
                    <tr key={s.id}>
                      <td>{s.customer_name}<div className="muted" style={{ fontSize: ".85rem" }}>{s.customer_phone}</div></td>
                      <td>{s.plan_name}</td>
                      <td><span className={`pill ${s.status === "active" ? "ok" : ""}`}>{s.status}</span></td>
                      <td>{s.starts_on} → {s.expires_on}</td>
                      <td>{s.suits_used} / {s.suit_allowance}</td>
                      <td>{s.shirts_used} / {s.shirt_allowance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 style={{ fontSize: "1.1rem", marginTop: 24 }}>Orders covered by subscriptions</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Customer</th><th>Collect on</th><th>Credit</th><th>Approved waiver</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {attached.length === 0 ? <tr><td colSpan={7} className="muted">None attached yet.</td></tr> : attached.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/admin/orders/${o.id}`}>{o.order_no}</Link></td>
                      <td>{o.customer}</td>
                      <td>{o.preferred_collection_date}</td>
                      <td>{formatEtb(o.subscription_credit_etb)}</td>
                      <td>{o.subscription_approved ? "Yes" : "No"}</td>
                      <td>{formatEtb(o.total_etb)}</td>
                      <td>
                        <form action={detachOrderAction}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <button className="btn btn-ghost btn-sm" type="submit">Detach</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside>
            <form action={activateSubscriptionAction} className="panel">
              <h3>Activate a plan</h3>
              <div className="field"><label htmlFor="name">Customer name</label><input id="name" name="name" required /></div>
              <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" name="phone" required placeholder="0911 234 567" /></div>
              <div className="field"><label htmlFor="planId">Plan</label>
                <select id="planId" name="planId" required>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatEtb(p.price_etb)}/month</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="startsOn">Start date</label><input id="startsOn" name="startsOn" type="date" required defaultValue={today} /></div>
              <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Activate</button>
            </form>

            <form action={attachOrderAction} className="panel">
              <h3>Attach an order</h3>
              <div className="field"><label htmlFor="subscriptionId">Active subscription</label>
                <select id="subscriptionId" name="subscriptionId" required>
                  {subs.filter((s) => s.status === "active").map((s) => <option key={s.id} value={s.id}>{s.customer_name} — {s.plan_name}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="orderNo">Order number</label><input id="orderNo" name="orderNo" required placeholder="ESC-20991231-1234" /></div>
              <label className="inline" style={{ marginBottom: 12 }}>
                <input type="checkbox" name="approve" style={{ width: 20, minHeight: 20 }} /> Waive overage (admin approval)
              </label>
              <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Attach</button>
            </form>
          </aside>
        </div>
      </div>
    </section>
  );
}
