import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { formatEtb } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { getSetting } from "@/lib/settings";
import { STATUS_LABELS, ORDER_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/status";
import {
  getGarments, getOrderItems, getPayments, getStatusHistory, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
} from "@/lib/orders";
import { setStatusAction, updateOpsAction, recordPaymentAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const orderId = Number(id);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as Record<string, string | number | null> | undefined;
  if (!order) notFound();
  const o = order as Record<string, any>;

  const items = getOrderItems(db, orderId);
  const garments = getGarments(db, orderId);
  const history = getStatusHistory(db, orderId);
  const payments = getPayments(db, orderId);
  const couriers = db.prepare("SELECT id, name, phone FROM couriers WHERE active = 1 ORDER BY name").all() as { id: number; name: string; phone: string }[];
  const partners = db.prepare("SELECT id, name FROM cleaning_partners WHERE active = 1 ORDER BY name").all() as { id: number; name: string }[];
  const number = getSetting(db, "whatsapp_number");
  const updateMsg = `Hello ${o.customer_name}, an update on your order ${o.order_no}: ${STATUS_LABELS[o.status as keyof typeof STATUS_LABELS] ?? o.status}.`;
  const wa = whatsappLink(number, updateMsg);
  const outstanding = Number(o.total_etb) - payments.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_etb, 0);

  return (
    <section>
      <div className="container pad-bottom">
        <p><Link href="/admin">← Dashboard</Link></p>
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div><p className="eyebrow">Order</p><h1 style={{ marginBottom: 4 }}>{o.order_no}</h1></div>
          <span className="pill">{STATUS_LABELS[o.status as keyof typeof STATUS_LABELS] ?? o.status}</span>
        </div>
        {sp.ok ? <div className="alert ok">{sp.ok}</div> : null}
        {sp.error ? <div className="alert error">{sp.error}</div> : null}

        <div className="two-col">
          <div>
            <div className="panel">
              <h3>Customer &amp; collection</h3>
              <p><strong>{o.customer_name}</strong> · {o.customer_phone}{o.customer_email ? ` · ${o.customer_email}` : ""}</p>
              <p><strong>Collect:</strong> {o.collection_address}<br /><span className="muted">{o.preferred_collection_date} · {o.preferred_collection_window}</span></p>
              <p><strong>Return to:</strong> {o.delivery_address}<br /><span className="muted">Preferred return: {o.preferred_delivery_date ?? "—"}{o.delivery_instructions ? ` · ${o.delivery_instructions}` : ""}</span></p>
              {wa ? <a className="btn btn-ghost btn-sm" href={`${wa}`} target="_blank" rel="noopener noreferrer">Send status update on WhatsApp</a> : <span className="muted">Set a WhatsApp number in settings to send updates.</span>}
            </div>

            <div className="panel">
              <h3>Garments</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}><td>{i.service_name}{i.care_notes ? <div className="muted" style={{ fontSize: ".85rem" }}>Care note: {i.care_notes}</div> : null}</td><td>{i.quantity}</td><td>{formatEtb(i.unit_price_etb)}</td><td>{formatEtb(i.line_total_etb)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 style={{ marginTop: 18 }}>Garment tags</h3>
              <p className="muted" style={{ fontSize: ".9rem" }}>Each garment is traceable to this order. Print labels or QR codes are a Phase 2 item.</p>
              <ul style={{ fontFamily: "ui-monospace, monospace", fontSize: ".85rem" }}>
                {garments.map((g) => <li key={g.tag}>{g.tag} — {g.service_name} #{g.seq}</li>)}
              </ul>
            </div>

            <div className="panel">
              <h3>Status history</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>When</th><th>Status</th><th>Note</th><th>By</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}><td>{h.created_at}</td><td>{STATUS_LABELS[h.status as keyof typeof STATUS_LABELS] ?? h.status}</td><td>{h.note}</td><td>{h.actor}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside>
            <div className="panel">
              <h3>Update status</h3>
              <form action={setStatusAction}>
                <input type="hidden" name="orderId" value={orderId} />
                <div className="field"><label htmlFor="status">New status</label>
                  <select id="status" name="status" defaultValue={String(o.status)}>
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="note">Note <small>(optional, visible in history)</small></label><input id="note" name="note" maxLength={500} /></div>
                <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Save status</button>
              </form>
            </div>

            <div className="panel">
              <h3>Courier &amp; cleaning partner</h3>
              <form action={updateOpsAction}>
                <input type="hidden" name="orderId" value={orderId} />
                <div className="field"><label htmlFor="courierId">Courier</label>
                  <select id="courierId" name="courierId" defaultValue={o.courier_id ?? ""}>
                    <option value="">Unassigned</option>
                    {couriers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="cleaningPartnerId">Cleaning partner</label>
                  <select id="cleaningPartnerId" name="cleaningPartnerId" defaultValue={o.cleaning_partner_id ?? ""}>
                    <option value="">Unassigned</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="row2">
                  <div className="field"><label htmlFor="cleaningCost">Cleaning cost (ETB)</label><input id="cleaningCost" name="cleaningCost" type="number" min={0} defaultValue={o.cleaning_cost_etb} /></div>
                  <div className="field"><label htmlFor="courierCost">Courier cost (ETB)</label><input id="courierCost" name="courierCost" type="number" min={0} defaultValue={o.courier_cost_etb} /></div>
                </div>
                <div className="field"><label htmlFor="packagingCost">Packaging cost (ETB)</label><input id="packagingCost" name="packagingCost" type="number" min={0} defaultValue={o.packaging_cost_etb} /></div>
                <button className="btn btn-navy" type="submit" style={{ width: "100%" }}>Save assignments &amp; costs</button>
              </form>
            </div>

            <div className="panel summary">
              <h3>Payment</h3>
              <dl>
                <dt>Garments</dt><dd>{formatEtb(Number(o.subtotal_etb))}</dd>
                <dt>Discount {o.discount_code ? `(${o.discount_code})` : ""}</dt><dd>{Number(o.discount_etb) ? `− ${formatEtb(Number(o.discount_etb))}` : "—"}</dd>
                <dt>Delivery fee</dt><dd>{formatEtb(Number(o.delivery_fee_etb))}</dd>
                <dt className="total">Total</dt><dd className="total">{formatEtb(Number(o.total_etb))}</dd>
                <dt>Outstanding</dt><dd>{formatEtb(Math.max(outstanding, 0))}</dd>
              </dl>
              <p><span className="pill">{PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}</span> <span className="muted">{PAYMENT_METHOD_LABELS[o.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? o.payment_method}</span></p>
              {payments.length > 0 ? (
                <ul style={{ paddingLeft: 18, fontSize: ".9rem" }}>
                  {payments.map((p, i) => <li key={i}>{p.status} · {formatEtb(p.amount_etb)} · {p.reference} · {p.created_at}</li>)}
                </ul>
              ) : null}
              <form action={recordPaymentAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="orderId" value={orderId} />
                <div className="field"><label htmlFor="method">Method</label>
                  <select id="method" name="method" defaultValue={o.payment_method}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                  </select>
                </div>
                <div className="row2">
                  <div className="field"><label htmlFor="amount">Amount (ETB)</label><input id="amount" name="amount" type="number" min={1} required /></div>
                  <div className="field"><label htmlFor="status2">Result</label>
                    <select id="status2" name="status" defaultValue="paid">
                      <option value="paid">Verified paid</option>
                      <option value="awaiting_verification">Awaiting verification</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                </div>
                <div className="field"><label htmlFor="reference">Transaction reference</label><input id="reference" name="reference" required /><small>Each reference can be recorded only once per method.</small></div>
                <button className="btn btn-gold" type="submit" style={{ width: "100%" }}>Record payment</button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
