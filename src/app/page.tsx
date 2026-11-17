import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { formatEtb } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { addToCartAction } from "./actions";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const db = getDb();
  const plans = db.prepare("SELECT * FROM subscription_plans WHERE active = 1 ORDER BY price_etb").all() as {
    id: number; name: string; price_etb: number; suit_allowance: number; shirt_allowance: number; pickups_per_month: number; priority: number; description: string;
  }[];
  const categories = db.prepare(
    `SELECT c.name, c.slug, MIN(s.price_etb) AS from_price, MAX(s.turnaround_days) AS days
     FROM service_categories c JOIN services s ON s.category_id = c.id AND s.active = 1
     GROUP BY c.id ORDER BY c.sort_order`,
  ).all() as { name: string; slug: string; from_price: number; days: number }[];
  const number = getSetting(db, "whatsapp_number");
  const wa = whatsappLink(number, "Hello, I would like to book a garment collection.");
  const businessName = getSetting(db, "business_name", "Executive Suit Care");

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Addis Ababa · Premium garment care</p>
          <h1>Your Professional Wardrobe, Perfectly Cared For.</h1>
          <p>
            We collect your professional wear from your home or office, care for it with trusted dry-cleaning
            partners, and deliver it back ready for your next working day.
          </p>
          <div className="actions">
            <Link href="/services" className="btn btn-gold">Order Now</Link>
            <Link href="/#subscriptions" className="btn btn-light">Explore Subscriptions</Link>
          </div>
        </div>
      </section>

      <section id="how-it-works">
        <div className="container">
          <p className="eyebrow">How it works</p>
          <h2>Four simple steps</h2>
          <ol className="steps">
            <li><strong>Choose your garments</strong><br /><span className="muted">Select suits, shirts, blouses and more with transparent prices.</span></li>
            <li><strong>We collect</strong><br /><span className="muted">A courier collects at your chosen time window and confirms the handover.</span></li>
            <li><strong>We care for it</strong><br /><span className="muted">Each garment is tagged, cleaned by a trusted partner and quality-checked.</span></li>
            <li><strong>We return it</strong><br /><span className="muted">Delivered back to you, ready for your next working day.</span></li>
          </ol>
        </div>
      </section>

      <section className="alt" id="services">
        <div className="container">
          <p className="eyebrow">Services</p>
          <h2>Garment categories</h2>
          <div className="grid">
            {categories.map((c) => (
              <div className="card" key={c.slug}>
                <h3>{c.name}</h3>
                <p className="muted">From <span className="price">{formatEtb(c.from_price)}</span> · about {c.days} working day{c.days === 1 ? "" : "s"}</p>
              </div>
            ))}
          </div>
          <div className="actions"><Link className="btn btn-navy" href="/services">See full catalogue</Link></div>
        </div>
      </section>

      <section id="subscriptions">
        <div className="container">
          <p className="eyebrow">Subscriptions</p>
          <h2>Monthly packages</h2>
          <p className="muted">Allowances are per calendar month. Garments beyond your allowance are charged at catalogue prices or need admin approval.</p>
          <div className="grid">
            {plans.map((p) => (
              <div className="card" key={p.id}>
                <h3>{p.name}</h3>
                <p className="price" style={{ fontSize: "1.4rem" }}>{formatEtb(p.price_etb)} <span className="muted" style={{ fontSize: ".9rem", fontWeight: 400 }}>/ month</span></p>
                <ul>
                  <li>{p.suit_allowance} two-piece suits</li>
                  <li>{p.shirt_allowance} shirts or blouses</li>
                  <li>{p.pickups_per_month} scheduled collection{p.pickups_per_month === 1 ? "" : "s"} per month</li>
                  {p.priority ? <li>Priority collection and delivery, dedicated support</li> : null}
                </ul>
                <p className="muted">{p.description}</p>
              </div>
            ))}
          </div>
          {wa ? (
            <div className="actions"><a className="btn btn-navy" href={whatsappLink(number, "Hello, I would like to enquire about a monthly subscription.")!} target="_blank" rel="noopener noreferrer">Ask about subscriptions on WhatsApp</a></div>
          ) : null}
        </div>
      </section>

      <section className="alt">
        <div className="container">
          <p className="eyebrow">Testimonials</p>
          <h2>What our clients say</h2>
          <div className="card">
            <p className="muted">Client testimonials will be published here once they have been collected with each client&rsquo;s consent. We do not show placeholder reviews.</p>
          </div>
        </div>
      </section>

      <section id="corporate">
        <div className="container">
          <p className="eyebrow">Corporate</p>
          <h2>Garment-care programmes for organisations</h2>
          <p className="muted">
            Banks and professional firms can offer garment care to staff, with an agreed corporate discount, consolidated
            monthly reporting and corporate invoicing. Corporate accounts are being set up individually; no partnership
            is implied until one is agreed in writing.
          </p>
          <div className="actions">
            {wa ? <a className="btn btn-navy" href={whatsappLink(number, "Hello, I would like to discuss a corporate garment-care programme.")!} target="_blank" rel="noopener noreferrer">Discuss a corporate programme</a> : <span className="muted">Contact us to discuss a corporate programme.</span>}
          </div>
        </div>
      </section>

      <section className="alt">
        <div className="container">
          <p className="eyebrow">Quick order</p>
          <h2>Add a garment to your cart</h2>
          <form action={addToCartAction} className="inline">
            <select name="serviceId" aria-label="Garment" required>
              {(db.prepare("SELECT id, name, price_etb FROM services WHERE active = 1 ORDER BY id").all() as { id: number; name: string; price_etb: number }[]).map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {formatEtb(s.price_etb)}</option>
              ))}
            </select>
            <input className="qty" type="number" name="quantity" min={1} max={50} defaultValue={1} aria-label="Quantity" />
            <button className="btn btn-gold" type="submit">Add to cart</button>
          </form>
        </div>
      </section>

      <section>
        <div className="container">
          <p className="eyebrow">Contact</p>
          <h2>{businessName}</h2>
          <p>
            {wa ? <a href={wa} target="_blank" rel="noopener noreferrer">Chat with us on WhatsApp</a> : "WhatsApp is not yet configured."}
            <br />Addis Ababa, Ethiopia
          </p>
        </div>
      </section>
    </>
  );
}
