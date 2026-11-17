import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { dashboardStats, listOrders } from "@/lib/orders";
import { formatEtb } from "@/lib/money";
import { ORDER_STATUSES, STATUS_LABELS, PAYMENT_STATUS_LABELS, isOrderStatus } from "@/lib/status";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const s = dashboardStats(db);
  const orders = listOrders(db, { status: sp.status, q: sp.q?.trim() });
  const count = (k: string) => s.countsByStatus[k] ?? 0;
  const sum = (keys: string[]) => keys.reduce((n, k) => n + count(k), 0);

  return (
    <section>
      <div className="container">
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div><p className="eyebrow">Operations</p><h1>Dashboard</h1></div>
          <div className="inline">
            <Link className="btn btn-ghost btn-sm" href="/admin/subscriptions">Subscriptions</Link>
            <Link className="btn btn-ghost btn-sm" href="/admin/catalogue">Prices</Link>
            <Link className="btn btn-ghost btn-sm" href="/admin/settings">Settings</Link>
            <form action={logoutAction}><button className="btn btn-navy btn-sm" type="submit">Sign out</button></form>
          </div>
        </div>

        <h2 style={{ fontSize: "1.1rem", marginTop: 16 }}>Orders</h2>
        <div className="stats">
          <Stat label="Total orders" value={String(s.totalOrders)} />
          <Stat label="New (placed / payment pending)" value={String(sum(["order_placed", "payment_pending"]))} />
          <Stat label="Awaiting pickup" value={String(sum(["pickup_scheduled", "courier_assigned"]))} />
          <Stat label="Being cleaned" value={String(sum(["garments_collected", "received_at_facility", "cleaning_in_progress", "quality_inspection"]))} />
          <Stat label="Ready for delivery" value={String(sum(["ready_for_delivery", "return_courier_assigned", "out_for_delivery"]))} />
          <Stat label="Completed" value={String(sum(["delivered", "completed"]))} />
          <Stat label="Cancelled" value={String(count("cancelled"))} />
          <Stat label="Exceptions" value={String(sum(["delayed", "quality_issue", "re_cleaning_required", "customer_complaint"]))} />
        </div>

        <h2 style={{ fontSize: "1.1rem" }}>Finance</h2>
        <p className="muted" style={{ fontSize: ".9rem", marginTop: -6 }}>
          Revenue is what was booked, not profit. Contribution = revenue − cleaning, courier and packaging costs.
          It excludes rent, staff, software and other fixed costs, so it is not operating profit.
        </p>
        <div className="stats">
          <Stat label="Booked revenue" value={formatEtb(s.bookedRevenue)} />
          <Stat label="Cash received (net)" value={formatEtb(s.cashReceived)} />
          <Stat label="Outstanding balance" value={formatEtb(s.outstanding)} />
          <Stat label="Cleaning partner costs" value={formatEtb(s.cleaningCost)} />
          <Stat label="Courier costs" value={formatEtb(s.courierCost)} />
          <Stat label="Packaging costs" value={formatEtb(s.packagingCost)} />
          <Stat label="Contribution" value={formatEtb(s.contribution)} />
          <Stat label="Contribution margin" value={`${s.contributionMarginPct}%`} />
        </div>
        {s.revenueByService.length > 0 ? (
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead><tr><th>Service</th><th>Units</th><th>Revenue (before discounts &amp; delivery)</th></tr></thead>
              <tbody>
                {s.revenueByService.map((r) => (
                  <tr key={r.service}><td>{r.service}</td><td>{r.quantity}</td><td>{formatEtb(r.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <h2 style={{ fontSize: "1.1rem" }}>Order list</h2>
        <form className="inline" method="get" style={{ marginBottom: 14 }}>
          <select name="status" defaultValue={sp.status && isOrderStatus(sp.status) ? sp.status : ""} aria-label="Filter by status">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
          </select>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Order no., phone or name" aria-label="Search" />
          <button className="btn btn-navy btn-sm" type="submit">Filter</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Collect on</th><th>Status</th><th>Payment</th><th>Total</th><th>Courier / partner</th></tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={7} className="muted">No orders match.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`}>{o.order_no}</Link><div className="muted" style={{ fontSize: ".8rem" }}>{o.created_at}</div></td>
                  <td>{o.customer_name}<div className="muted" style={{ fontSize: ".85rem" }}>{o.customer_phone}</div></td>
                  <td>{o.preferred_collection_date}</td>
                  <td><span className="pill">{STATUS_LABELS[o.status] ?? o.status}</span></td>
                  <td><span className={`pill ${o.payment_status === "paid" ? "ok" : o.payment_status === "pending" ? "warn" : ""}`}>{PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}</span></td>
                  <td>{formatEtb(o.total_etb)}</td>
                  <td>{o.courier_name ?? "—"} / {o.partner_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
