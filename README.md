# Executive Suit Care — Online Ordering & Operations (Pilot MVP)

Next.js (App Router) + TypeScript web app for garment care in Addis Ababa. SQLite via Node's built-in
`node:sqlite` (no native dependencies). Prices, delivery zones, plans, discount codes, couriers, cleaning
partners and the WhatsApp number are all editable from the admin, not hardcoded.

## What works (tested)

- **Catalogue** (`/services`): the 10 garment categories from the brief, with quantity selector, add to cart,
  and turnaround. Test prices from the brief are seeded.
- **Cart** (`/cart`): change quantities, remove lines, care/stain notes per garment, discount codes.
- **Checkout** (`/checkout`): Ethiopian mobile validation (+251), collection and return details, zone fee,
  collection time window, payment method. Prices and fees are recalculated server-side. Each order gets a
  unique order number (`ESC-YYYYMMDD-NNNN`) and one traceable garment tag per unit.
- **Order tracking** (`/order/[orderNo]?t=<token>`): private link; wrong token returns 404. Shows the
  13-step pipeline, garments, payment status and totals.
- **Admin** (`/admin`, password login with signed, expiring session cookie):
  - Dashboard: order counts by stage, filters, and finance figures (booked revenue, net cash received,
    outstanding, cleaning/courier/packaging costs, contribution and margin, revenue by service). Revenue, cash
    and contribution are kept separate and labelled.
  - Order detail: update status with history, assign courier and cleaning partner, record cost per order,
    record payments with a transaction reference (duplicate references are blocked), send a WhatsApp update link.
  - Prices: edit garment prices, turnaround, on-sale flag and plan prices. Existing orders keep their
    historical prices (tested).
  - Settings: business contact, WhatsApp number, collection windows, delivery zones and fees, couriers,
    cleaning partners, discount codes.
- **WhatsApp**: floating button and click-to-chat links, shown only once a number is set in admin.
- **Policies** page (draft; needs legal review).

## Not yet built (honest gap list)

- Customer accounts (login, saved addresses, order history, receipts, complaints). Checkout is guest
  checkout, with a customer profile keyed by phone.
- Subscriptions lifecycle: plans are shown and priced, but activation, allowance tracking, renewals and
  upgrades are not implemented.
- Corporate module (accounts, employee lists, invoicing). The home page only offers a contact route.
- Courier dashboard. Admin assigns couriers manually; couriers have no login yet.
- Notifications (email, SMS, in-app). Only WhatsApp click-to-chat links exist.
- Cleaning partner performance/QC records beyond the cost fields; printable labels or QR codes.
- Automated payment APIs (Telebirr, CBE Birr). Payments are recorded manually by the admin.
- Amharic localisation. Brand photography is not included; the hero uses a navy gradient placeholder.
- Testimonials: none are shown until real, consented testimonials are collected.
- Authentication for staff roles. Only one admin password exists.
- Deployment, backups and a staging environment.

## Running locally

```bash
npm install
cp .env.example .env.local      # then set ADMIN_PASSWORD and SESSION_SECRET (32+ chars)
npm run dev                      # http://localhost:3000
```

Database: SQLite file at `DATABASE_PATH` (default `./data/esc.sqlite`). Migrations run on startup and seed
test data (services, plans, zones, a `WELCOME10` discount) only when the services table is empty.

```bash
npm test          # unit tests: pricing, phone, auth, cart, orders, payments, finance
npm run typecheck
npm run build && npm start
```

## Business rules encoded in code

- Totals = garments subtotal − discount + zone delivery fee. Percent discounts are floored and capped.
- Payment status is derived from the ledger: paid minus refunded against the order total.
- Revenue (booked order totals) is not profit. Contribution = revenue − cleaning − courier − packaging.
  It excludes fixed costs, so it is not operating profit.
- Admin mutations are recorded in `audit_logs`.

## Open items before pilot

- Confirm test prices, zone fees and plan terms with the owner. All are placeholders until then.
- Obtain legal review of the policies page.
- Review the reference site (klin.lu) for positioning once it is reachable from the build environment.
