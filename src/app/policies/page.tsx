import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy & terms" };

export default function PoliciesPage() {
  return (
    <section>
      <div className="container">
        <h1>Privacy &amp; terms</h1>
        <div className="panel">
          <h3>Privacy</h3>
          <p>We collect your name, mobile number, optional email and collection and delivery addresses to fulfil your garment-care orders and contact you about them. We do not sell personal data. Your details are visible only to authorised Executive Suit Care staff and the couriers and cleaning partners who handle your order.</p>
          <p>Order tracking links are private to the person who placed the order. Please do not share them publicly.</p>
          <h3>Terms</h3>
          <p>Prices are shown in Ethiopian Birr and include cleaning. Turnaround times are estimates and may change for delicate or heavily soiled garments. Garments with pre-existing damage are noted at collection. Our cleaning partners follow the care instructions you provide; please describe stains and fabric concerns in the notes.</p>
          <p>Payments are confirmed by our team before processing during the pilot. Liability for damage or loss is subject to a written agreement; the final terms will be published before public launch.</p>
          <p className="muted">This page is a draft and must be reviewed by the business owner and legal counsel before launch.</p>
        </div>
      </div>
    </section>
  );
}
