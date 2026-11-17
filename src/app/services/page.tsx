import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { formatEtb } from "@/lib/money";
import { addToCartAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Services & prices" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const rows = getDb().prepare(
    `SELECT c.name AS category, s.id, s.name, s.description, s.price_etb, s.turnaround_days
     FROM services s JOIN service_categories c ON c.id = s.category_id
     WHERE s.active = 1 ORDER BY c.sort_order, s.id`,
  ).all() as { category: string; id: number; name: string; description: string; price_etb: number; turnaround_days: number }[];

  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);

  return (
    <section>
      <div className="container">
        <p className="eyebrow">Catalogue</p>
        <h1>Services &amp; prices</h1>
        <p className="muted">Prices are in Ethiopian Birr and include cleaning. Delivery is charged per zone at checkout.</p>
        {sp.error ? <div className="alert error">{sp.error}</div> : null}
        {[...groups.entries()].map(([category, items]) => (
          <div key={category} className="panel" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: "1.2rem" }}>{category}</h2>
            <div className="grid">
              {items.map((s) => (
                <form key={s.id} action={addToCartAction} className="card" style={{ display: "grid", gap: 10 }}>
                  <input type="hidden" name="serviceId" value={s.id} />
                  <h3>{s.name}</h3>
                  <p className="muted" style={{ margin: 0 }}>{s.description}</p>
                  <p className="price" style={{ margin: 0 }}>{formatEtb(s.price_etb)} <span className="muted" style={{ fontWeight: 400, fontSize: ".9rem" }}>· about {s.turnaround_days} working day{s.turnaround_days === 1 ? "" : "s"}</span></p>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`q-${s.id}`}>Quantity</label>
                    <select id={`q-${s.id}`} name="quantity" defaultValue="1">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-gold" type="submit">Add to cart</button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
