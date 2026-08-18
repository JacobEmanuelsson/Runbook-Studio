import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Radio,
  ShieldCheck,
  Siren,
  UsersRound,
} from "lucide-react";

export const dynamic = "force-dynamic";

const landingStats = [
  { label: "Active templates", value: "3", icon: BookOpen },
  { label: "SEV coverage", value: "100%", icon: ShieldCheck },
  { label: "Avg resolve", value: "36m", icon: Clock3 },
];

async function getLandingUser() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const { getCurrentSession } = await import("@/server/auth/require-session");
    const session = await getCurrentSession();
    return session?.user ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export default async function Home() {
  const currentUser = await getLandingUser();
  const primaryHref = currentUser ? "/workspace" : "/sign-in?mode=sign-up";
  const primaryLabel = currentUser ? "Open workspace" : "Create account";

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <header className="landing-nav">
          <Link className="landing-brand" href="/">
            <span><Radio size={18} aria-hidden="true" /></span>
            <strong>Runbook Studio</strong>
          </Link>
          <nav className="landing-links" aria-label="Entry options">
            <Link href="/demo">Demo</Link>
            <Link href="/sign-in">Sign in</Link>
            {currentUser && <Link href="/workspace">Workspace</Link>}
          </nav>
        </header>

        <div className="landing-preview" aria-hidden="true">
          <div className="preview-window">
            <div className="preview-topline">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-grid">
              <div className="preview-sidebar">
                <strong>Command</strong>
                <span>Runbooks</span>
                <span>Services</span>
                <span>Team</span>
              </div>
              <div className="preview-main">
                <div className="preview-kpis">
                  <span>2 active</span>
                  <span>1 degraded</span>
                  <span>36m MTTR</span>
                </div>
                <div className="preview-incident">
                  <strong>Checkout latency above SLO</strong>
                  <small>SEV-2 / monitoring</small>
                  <div><span /></div>
                </div>
                <div className="preview-steps">
                  <span>Confirm customer impact</span>
                  <span>Roll back checkout deploy</span>
                  <span>Post-incident report</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-content">
          <p className="eyebrow">Incident operations workspace</p>
          <h1 id="landing-title">Runbook Studio</h1>
          <p className="landing-copy">
            A focused command center for launching incident runbooks, tracking service health,
            coordinating responders, and saving the post-incident record.
          </p>

          <div className="landing-actions">
            <Link className="primary-action landing-action" href={primaryHref}>
              <span>{primaryLabel}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="secondary-action landing-action" href="/demo">
              <Siren size={18} aria-hidden="true" />
              <span>Explore demo</span>
            </Link>
          </div>

          <dl className="landing-stats" aria-label="Demo workspace snapshot">
            {landingStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label}>
                  <dt><Icon size={16} aria-hidden="true" /> {stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      <section className="entry-band" aria-labelledby="entry-heading">
        <div className="entry-heading">
          <p className="eyebrow">Choose your path</p>
          <h2 id="entry-heading">Start with a demo or save your own workspace.</h2>
        </div>

        <div className="entry-grid">
          <Link className="entry-card" href="/demo">
            <span><Siren size={18} aria-hidden="true" /></span>
            <strong>Demo workspace</strong>
            <small>Open the premade incident command center and try the workflow immediately.</small>
          </Link>
          <Link className="entry-card" href="/sign-in?mode=sign-up">
            <span><UsersRound size={18} aria-hidden="true" /></span>
            <strong>Create account</strong>
            <small>Start a saved Prisma-backed workspace with your own services and runbooks.</small>
          </Link>
          <Link className="entry-card" href="/sign-in">
            <span><CheckCircle2 size={18} aria-hidden="true" /></span>
            <strong>Open saved workspace</strong>
            <small>Return to your saved incident history, team, reports, and catalog.</small>
          </Link>
        </div>
      </section>
    </main>
  );
}
