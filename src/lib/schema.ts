// Versioned SQL migrations. Append new entries; never edit an applied migration.
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_initial",
    sql: `
CREATE TABLE service_categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Editable retail prices (ETB, whole birr). Orders snapshot price at purchase time.
CREATE TABLE services (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES service_categories(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_etb INTEGER NOT NULL CHECK (price_etb >= 0),
  turnaround_days INTEGER NOT NULL DEFAULT 2 CHECK (turnaround_days >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE delivery_zones (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  fee_etb INTEGER NOT NULL CHECK (fee_etb >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE discounts (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value INTEGER NOT NULL CHECK (value > 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE couriers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cleaning_partners (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  tracking_token TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  collection_address TEXT NOT NULL,
  zone_id INTEGER REFERENCES delivery_zones(id),
  delivery_address TEXT NOT NULL,
  preferred_collection_date TEXT NOT NULL,
  preferred_collection_window TEXT NOT NULL,
  preferred_delivery_date TEXT,
  delivery_instructions TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'order_placed',
  subtotal_etb INTEGER NOT NULL,
  delivery_fee_etb INTEGER NOT NULL,
  discount_etb INTEGER NOT NULL DEFAULT 0,
  discount_code TEXT,
  total_etb INTEGER NOT NULL,
  courier_id INTEGER REFERENCES couriers(id),
  cleaning_partner_id INTEGER REFERENCES cleaning_partners(id),
  cleaning_cost_etb INTEGER NOT NULL DEFAULT 0,
  courier_cost_etb INTEGER NOT NULL DEFAULT 0,
  packaging_cost_etb INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id),
  service_name TEXT NOT NULL,
  unit_price_etb INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_etb INTEGER NOT NULL,
  care_notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- One row per physical garment, for traceability and labels/QR later.
CREATE TABLE garments (
  id INTEGER PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  tag TEXT NOT NULL UNIQUE,
  seq INTEGER NOT NULL,
  condition_notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE status_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_status_history_order ON status_history(order_id);

-- Manual payment ledger. A transaction reference may be recorded only once per method.
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount_etb INTEGER NOT NULL CHECK (amount_etb > 0),
  reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting_verification', 'paid', 'failed', 'refunded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (method, reference)
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE subscription_plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price_etb INTEGER NOT NULL CHECK (price_etb >= 0),
  suit_allowance INTEGER NOT NULL,
  shirt_allowance INTEGER NOT NULL,
  pickups_per_month INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  starts_on TEXT,
  expires_on TEXT,
  suits_used INTEGER NOT NULL DEFAULT 0,
  shirts_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  },
  {
    id: "002_subscription_usage",
    sql: `
ALTER TABLE orders ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id);
ALTER TABLE orders ADD COLUMN subscription_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN subscription_credit_etb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN subscription_covered_suits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN subscription_covered_shirts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_orders_subscription ON orders(subscription_id);
`,
  },
];
