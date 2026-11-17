import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { saveCatalogueAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prices", robots: { index: false } };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const services = db.prepare(
    `SELECT s.id, s.name, s.price_etb, s.turnaround_days, s.active, c.name AS category
     FROM services s JOIN service_categories c ON c.id = s.category_id ORDER BY c.sort_order, s.id`,
  ).all() as { id: number; name: string; price_etb: number; turnaround_days: number; active: number; category: string }[];
  const plans = db.prepare("SELECT id, name, price_etb, suit_allowance, shirt_allowance, pickups_per_month, priority FROM subscription_plans ORDER BY price_etb").all() as {
    id: number; name: string; price_etb: number; suit_allowance: number; shirt_allowance: number; pickups_per_month: number; priority: number;
  }[];

  return (
    <section>
      <div className="container pad-bottom">
        <p><Link href="/admin">← Dashboard</Link></p>
        <h1>Prices &amp; catalogue</h1>
        <p className="muted">Changes apply to new orders only. Existing orders keep the prices they were placed at. Test prices from the brief are pre-filled and should be confirmed by the owner.</p>
        {sp.ok ? <div className="alert ok">{sp.ok}</div> : null}
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        <form action={saveCatalogueAction}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category</th><th>Garment</th><th>Price (ETB)</th><th>Turnaround (days)</th><th>On sale</th></tr></thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td>{s.category}</td>
                    <td>{s.name}</td>
                    <td><input type="number" min={0} name={`price_${s.id}`} defaultValue={s.price_etb} style={{ maxWidth: 130 }} /></td>
                    <td><input type="number" min={0} name={`days_${s.id}`} defaultValue={s.turnaround_days} style={{ maxWidth: 100 }} /></td>
                    <td><input type="checkbox" name={`active_${s.id}`} defaultChecked={!!s.active} style={{ width: 22, minHeight: 22 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 28, fontSize: "1.2rem" }}>Subscription plans</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Plan</th><th>Monthly price (ETB)</th><th>Suits</th><th>Shirts / blouses</th><th>Pickups / month</th><th>Priority</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td><input type="number" min={0} name={`planprice_${p.id}`} defaultValue={p.price_etb} style={{ maxWidth: 130 }} /></td>
                    <td>{p.suit_allowance}</td><td>{p.shirt_allowance}</td><td>{p.pickups_per_month}</td><td>{p.priority ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions"><button className="btn btn-gold" type="submit">Save prices</button></div>
        </form>
      </div>
    </section>
  );
}
