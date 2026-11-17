import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getDb } from "@/lib/db";
import { getSetting, getCollectionWindows } from "@/lib/settings";
import { formatEtb } from "@/lib/money";
import { saveSettingsAction, saveZonesAction, addPersonAction, addDiscountAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const zones = db.prepare("SELECT id, name, fee_etb, active FROM delivery_zones ORDER BY name").all() as { id: number; name: string; fee_etb: number; active: number }[];
  const couriers = db.prepare("SELECT name, phone, active FROM couriers ORDER BY name").all() as { name: string; phone: string; active: number }[];
  const partners = db.prepare("SELECT name, phone, address FROM cleaning_partners ORDER BY name").all() as { name: string; phone: string; address: string }[];
  const discounts = db.prepare("SELECT code, kind, value, active FROM discounts ORDER BY code").all() as { code: string; kind: string; value: number; active: number }[];

  return (
    <section>
      <div className="container pad-bottom">
        <p><Link href="/admin">← Dashboard</Link></p>
        <h1>Settings</h1>
        {sp.ok ? <div className="alert ok">{sp.ok}</div> : null}
        {sp.error ? <div className="alert error">{sp.error}</div> : null}

        <div className="two-col">
          <div>
            <form action={saveSettingsAction} className="panel">
              <h3>Business &amp; contact</h3>
              <div className="field"><label htmlFor="business_name">Business name</label><input id="business_name" name="business_name" defaultValue={getSetting(db, "business_name")} /></div>
              <div className="field"><label htmlFor="whatsapp_number">WhatsApp number</label><input id="whatsapp_number" name="whatsapp_number" defaultValue={getSetting(db, "whatsapp_number")} placeholder="+251 9XX XXX XXX" /><small>Used for the floating button and click-to-chat links. Not hardcoded.</small></div>
              <div className="row2">
                <div className="field"><label htmlFor="business_phone">Phone</label><input id="business_phone" name="business_phone" defaultValue={getSetting(db, "business_phone")} /></div>
                <div className="field"><label htmlFor="business_email">Email</label><input id="business_email" name="business_email" type="email" defaultValue={getSetting(db, "business_email")} /></div>
              </div>
              <div className="field"><label htmlFor="collection_windows">Collection time windows</label><textarea id="collection_windows" name="collection_windows" defaultValue={getCollectionWindows(db).join("\n")} /><small>One per line.</small></div>
              <button className="btn btn-navy" type="submit">Save settings</button>
            </form>

            <form action={saveZonesAction} className="panel">
              <h3>Delivery zones &amp; fees</h3>
              <p className="muted" style={{ fontSize: ".9rem" }}>Fees are placeholder test values and must be confirmed before launch.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Zone</th><th>Fee (ETB)</th><th>Active</th></tr></thead>
                  <tbody>
                    {zones.map((z) => (
                      <tr key={z.id}>
                        <td>{z.name}</td>
                        <td><input type="number" min={0} name={`fee_${z.id}`} defaultValue={z.fee_etb} style={{ maxWidth: 120 }} /></td>
                        <td><input type="checkbox" name={`zone_${z.id}`} defaultChecked={!!z.active} style={{ width: 22, minHeight: 22 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row2" style={{ marginTop: 14 }}>
                <div className="field"><label htmlFor="new_zone">New zone</label><input id="new_zone" name="new_zone" placeholder="e.g. Megenagna" /></div>
                <div className="field"><label htmlFor="new_zone_fee">Fee (ETB)</label><input id="new_zone_fee" name="new_zone_fee" type="number" min={0} /></div>
              </div>
              <button className="btn btn-navy" type="submit">Save zones</button>
            </form>
          </div>

          <div>
            <form action={addPersonAction} className="panel">
              <h3>Add courier or cleaning partner</h3>
              <div className="field"><label htmlFor="kind">Type</label>
                <select id="kind" name="kind"><option value="courier">Courier</option><option value="partner">Cleaning partner</option></select>
              </div>
              <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" required /></div>
              <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" /></div>
              <div className="field"><label htmlFor="address">Address <small>(partners)</small></label><input id="address" name="address" /></div>
              <button className="btn btn-navy" type="submit">Add</button>
            </form>
            <div className="panel">
              <h3>Couriers</h3>
              <ul>{couriers.map((c) => <li key={c.name}>{c.name} · {c.phone}</li>)}{couriers.length === 0 ? <li className="muted">None yet</li> : null}</ul>
              <h3 style={{ marginTop: 14 }}>Cleaning partners</h3>
              <ul>{partners.map((p) => <li key={p.name}>{p.name} · {p.phone}</li>)}{partners.length === 0 ? <li className="muted">None yet</li> : null}</ul>
            </div>

            <form action={addDiscountAction} className="panel">
              <h3>Discount codes</h3>
              <ul style={{ paddingLeft: 18 }}>
                {discounts.map((d) => <li key={d.code}>{d.code} — {d.kind === "percent" ? `${d.value}%` : formatEtb(d.value)} {d.active ? "" : "(inactive)"}</li>)}
              </ul>
              <div className="row2">
                <div className="field"><label htmlFor="code">Code</label><input id="code" name="code" required placeholder="CORP-BANK" /></div>
                <div className="field"><label htmlFor="kind2">Type</label><select id="kind2" name="kind"><option value="percent">Percent</option><option value="fixed">Fixed ETB</option></select></div>
              </div>
              <div className="field"><label htmlFor="value">Value</label><input id="value" name="value" type="number" min={1} required /></div>
              <button className="btn btn-navy" type="submit">Add code</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
