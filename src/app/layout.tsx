import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { CART_COOKIE, parseCart } from "@/lib/cart";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Executive Suit Care", template: "%s · Executive Suit Care" },
  description: "Premium garment care for bankers and professionals in Addis Ababa. We collect your professional wear, care for it, and return it ready for your next working day.",
  applicationName: "Executive Suit Care",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14213d" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const number = getSetting(db, "whatsapp_number");
  const phone = getSetting(db, "business_phone");
  const email = getSetting(db, "business_email");
  const cartCount = parseCart((await cookies()).get(CART_COOKIE)?.value).reduce((n, i) => n + i.quantity, 0);
  const wa = whatsappLink(number, "Hello Executive Suit Care, I would like to enquire about your garment care service.");

  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="container">
            <Link href="/" className="brand">Executive <span>Suit Care</span></Link>
            <nav className="main">
              <Link href="/services">Services &amp; prices</Link>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#subscriptions">Subscriptions</Link>
              <Link href="/#corporate">Corporate</Link>
              <Link href={`/cart`} className="cart-link">Cart{cartCount ? ` (${cartCount})` : ""}</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="container cols">
            <div>
              <h3 style={{ color: "#fff" }}>Executive Suit Care</h3>
              <p>Premium garment care for professionals in Addis Ababa, Ethiopia.</p>
            </div>
            <div>
              <h3 style={{ color: "#fff" }}>Contact</h3>
              <p>
                {phone && <>Phone: {phone}<br /></>}
                {email && <>Email: <a href={`mailto:${email}`}>{email}</a><br /></>}
                {!phone && !email && <span>Contact details are set in the admin settings.<br /></span>}
                Addis Ababa, Ethiopia
              </p>
            </div>
            <div>
              <h3 style={{ color: "#fff" }}>Policies</h3>
              <p>
                <Link href="/policies">Privacy &amp; terms</Link><br />
                Payments are verified manually during the pilot. Turnaround times are estimates.
              </p>
            </div>
          </div>
        </footer>
        {wa && (
          <a className="wa-fab" href={wa} target="_blank" rel="noopener noreferrer">
            WhatsApp us
          </a>
        )}
      </body>
    </html>
  );
}
