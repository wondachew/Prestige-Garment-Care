import type { DatabaseSync } from "node:sqlite";

// Initial TEST prices and placeholder values from the brief. All editable in /admin.
const CATEGORIES: { slug: string; name: string; service: string; price: number; days: number; description: string }[] = [
  { slug: "mens-two-piece", name: "Men's two-piece suits", service: "Men's two-piece suit", price: 900, days: 3, description: "Jacket and trousers, dry-cleaned and pressed." },
  { slug: "womens-two-piece", name: "Women's two-piece suits", service: "Women's two-piece suit", price: 900, days: 3, description: "Jacket and skirt or trousers, carefully finished." },
  { slug: "three-piece", name: "Three-piece suits", service: "Three-piece suit", price: 1100, days: 3, description: "Jacket, waistcoat and trousers." },
  { slug: "blazers-jackets", name: "Blazers and jackets", service: "Blazer", price: 550, days: 2, description: "Structured blazers and formal jackets." },
  { slug: "formal-trousers", name: "Formal trousers", service: "Formal trousers", price: 250, days: 2, description: "Pressed and crease-ready." },
  { slug: "formal-skirts", name: "Formal skirts", service: "Formal skirt", price: 250, days: 2, description: "Pleated and pencil skirts." },
  { slug: "dress-shirts", name: "Dress shirts", service: "Dress shirt", price: 150, days: 1, description: "Laundered, starched and pressed." },
  { slug: "womens-blouses", name: "Women's blouses", service: "Women's blouse", price: 150, days: 1, description: "Delicate fabrics handled with care." },
  { slug: "ties", name: "Ties", service: "Tie", price: 200, days: 2, description: "Silk and wool ties, cleaned and reshaped." },
  { slug: "suit-steaming", name: "Suit steaming", service: "Suit steaming", price: 300, days: 1, description: "Refresh a suit without full cleaning." },
];

const PLANS = [
  { name: "Executive Starter", price: 2300, suits: 2, shirts: 2, pickups: 1, priority: 0, description: "Two suits and two shirts or blouses, one scheduled collection and return cycle per month." },
  { name: "Executive Professional", price: 4400, suits: 4, shirts: 4, pickups: 4, priority: 0, description: "Four suits and four shirts or blouses, weekly scheduled service." },
  { name: "Executive Premium", price: 6500, suits: 6, shirts: 6, pickups: 4, priority: 1, description: "Six suits and six shirts or blouses, priority collection and delivery, dedicated support." },
];

// Placeholder zone fees: test values only, replace before launch.
const ZONES = [
  ["Bole", 150], ["Kirkos", 150], ["Arada", 150], ["Lideta", 150],
  ["Yeka", 200], ["Kolfe Keranio", 200], ["Gulele", 200],
] as const;

const SETTINGS: Record<string, string> = {
  business_name: "Executive Suit Care",
  whatsapp_number: "",
  business_phone: "",
  business_email: "",
  collection_windows: JSON.stringify(["Morning (08:00–12:00)", "Afternoon (12:00–16:00)", "Late afternoon (16:00–19:00)"]),
};

export function seedIfEmpty(db: DatabaseSync): void {
  const row = db.prepare("SELECT COUNT(*) AS n FROM services").get() as { n: number };
  if (row.n > 0) return;

  db.exec("BEGIN");
  try {
    const catStmt = db.prepare("INSERT INTO service_categories (slug, name, sort_order) VALUES (?, ?, ?) RETURNING id");
    const svcStmt = db.prepare("INSERT INTO services (category_id, name, description, price_etb, turnaround_days) VALUES (?, ?, ?, ?, ?)");
    CATEGORIES.forEach((c, i) => {
      const cat = catStmt.get(c.slug, c.name, i + 1) as { id: number };
      svcStmt.run(cat.id, c.service, c.description, c.price, c.days);
    });

    const planStmt = db.prepare(
      "INSERT INTO subscription_plans (name, price_etb, suit_allowance, shirt_allowance, pickups_per_month, priority, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const p of PLANS) planStmt.run(p.name, p.price, p.suits, p.shirts, p.pickups, p.priority, p.description);

    const zoneStmt = db.prepare("INSERT INTO delivery_zones (name, fee_etb) VALUES (?, ?)");
    for (const [name, fee] of ZONES) zoneStmt.run(name, fee);

    db.prepare("INSERT INTO discounts (code, kind, value) VALUES ('WELCOME10', 'percent', 10)").run();

    const setStmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    for (const [k, v] of Object.entries(SETTINGS)) setStmt.run(k, v);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
