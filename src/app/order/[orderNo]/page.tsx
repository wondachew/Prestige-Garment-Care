import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { formatEtb } from "@/lib/money";
import { STATUS_LABELS, TRACKING_STEPS, PAYMENT_STATUS_LABELS, isOrderStatus } from "@/lib/status";
import { getOrderByNumber, getOrderItems, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/orders";
import { getSetting } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

/** Tracking is protected by the per-order token in the link (?t=...). Wrong or missing token → not found. */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNo } = await params;
  const { t } = await searchParams;
  const db = getDb();
  const order = getOrderByNumber(db, decodeURIComponent(orderNo));
  if (!order || !t || t.length !== 32 || t !== order.tracking_token) notFound();

  const items = getOrderItems(db, Number(order.id));
  const status = String(order.status);
  const currentIdx = isOrderStatus(status) ? TRACKING_STEPS.indexOf(status) : -1;
  const cancelled = status === "cancelled";
  const method = String(order.payment_method) as PaymentMethod;
  const number = getSetting(db, "whatsapp_number");
  const wa = whatsappLink(number, `Hello, I'm asking about my order ${order.order_no}.`);

  return (
    <section>
      <div className="container pad-bottom">
        <p className="eyebrow">Order {String(order.order_no)}</p>
        <h1>Hello {String(order.customer_name).split(" ")[0]}</h1>
        <p className="muted">Collection: {String(order.preferred_collection_date)} · {String(order.preferred_collection_window)}</p>

        <div className="two-col">
          <div>
            <div className="panel">
              <h3>Status</h3>
              {cancelled ? (
                <p className="pill bad">Cancelled</p>
              ) : (
                <ol className="tracker">
                  {TRACKING_STEPS.map((s, i) => (
                    <li key={s} className={i < currentIdx ? "done" : i === currentIdx ? "current" : ""}>
                      <span className="dot" aria-hidden />
                      {STATUS_LABELS[s]}
                    </li>
                  ))}
                </ol>
              )}
              {!cancelled && currentIdx === -1 ? <p className="pill warn">{STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}</p> : null}
            </div>

            <div className="panel">
              <h3>Garments</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.service_name}{i.care_notes ? <div className="muted" style={{ fontSize: ".85rem" }}>Note: {i.care_notes}</div> : null}</td>
                        <td>{i.quantity}</td>
                        <td>{formatEtb(i.line_total_etb)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside>
            <div className="panel summary">
              <h3>Payment</h3>
              <dl>
                <dt>Garments</dt><dd>{formatEtb(Number(order.subtotal_etb))}</dd>
                <dt>Discount</dt><dd>{Number(order.discount_etb) ? `− ${formatEtb(Number(order.discount_etb))}` : "—"}</dd>
                <dt>Delivery</dt><dd>{formatEtb(Number(order.delivery_fee_etb))}</dd>
                <dt className="total">Total</dt><dd className="total">{formatEtb(Number(order.total_etb))}</dd>
              </dl>
              <p><span className="pill">{PAYMENT_STATUS_LABELS[String(order.payment_status)] ?? String(order.payment_status)}</span></p>
              <p className="muted">Method: {PAYMENT_METHOD_LABELS[method] ?? method}</p>
              {String(order.payment_status) !== "paid" ? (
                <p className="muted" style={{ fontSize: ".92rem" }}>
                  Please pay to the account or wallet provided by our team and send the transaction reference
                  {wa ? <> on <a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></> : " to our team"}.
                  We confirm payment manually during the pilot.
                </p>
              ) : null}
            </div>
            <div className="panel">
              <h3>Delivery</h3>
              <p>{String(order.delivery_address)}</p>
              <p className="muted">Zone: {String(order.zone_name ?? "—")}</p>
              {order.courier_name ? <p>Courier: {String(order.courier_name)}</p> : <p className="muted">Courier will be assigned before collection.</p>}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
