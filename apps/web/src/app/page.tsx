import { StatusBadge } from "@ptas/ui";

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="title-row">
        <div>
          <p className="eyebrow">Punjab Professional Tax Administration System</p>
          <h1>Engineering preview</h1>
        </div>
        <StatusBadge tone="warning">Not for production</StatusBadge>
      </div>

      <section className="panel" aria-labelledby="readiness-heading">
        <h2 id="readiness-heading">Repository readiness</h2>
        <p>
          The platform foundation is ready for supervised, story-by-story development. Legal forms,
          rates, live payments, real taxpayer data and production deployment remain approval-gated.
        </p>
        <dl className="summary-grid">
          <div>
            <dt>First story</dt>
            <dd>PTAS-000</dd>
          </div>
          <div>
            <dt>Architecture</dt>
            <dd>Managed cloud, modular monolith</dd>
          </div>
          <div>
            <dt>Accessibility</dt>
            <dd>WCAG 2.2 AA baseline</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
