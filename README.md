# Runbook Studio

Runbook Studio is a fullstack incident runbook workspace for operational teams. It is designed as a portfolio-grade product surface for incident response, service health, reusable runbooks, audit timelines, and operational reporting.

## Current Slice

- Operations dashboard with active incidents, service health, and runbook coverage.
- Incident workspace with severity, commander, timeline, notes, and assigned checklist steps.
- Reusable runbook library and editor for template details, services, severity, estimates, and ordered checklist steps.
- Service catalog editor for service ownership, tier, status, SLO, and deployment metadata.
- Team member view with owner-managed role changes and pending invitations.
- Post-incident report capture for summary, impact, root cause, resolution, and follow-ups.
- Authenticated Prisma reads and server actions for launching incidents, checklist updates, assignments, notes, and resolution.
- Role-aware server actions for incident responders, incident commanders, owners, and viewers.
- Authenticated server actions for saving and deleting runbook templates and services.
- Local browser persistence for demo workflows when no database session is active.
- Better Auth email/password route and sign-in/sign-up screen.
- Prisma/PostgreSQL schema for organizations, membership, services, runbooks, incidents, auth sessions, and audit data.
- Database seed script for the same demo workspace shown in the UI.
- Pure workflow rules covered by Node tests.
- Playwright smoke test for the core dashboard surface.

## Stack

- Next.js App Router
- React
- Prisma
- PostgreSQL
- Better Auth
- Zod
- Node test runner
- Playwright

## Local Development

Use Node.js 24.x. The Prisma 7 toolchain does not support Node 23.

```bash
npm install
npm run db:generate
npm run dev
```

Open `http://localhost:3000`.

Run checks:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm run smoke:db
```

`npm run smoke:db` expects the app server to be running and uses the configured database to verify sign-up, persisted incident launch, runbook edits, service creation, post-incident report capture, team invitations, sign-out/sign-in, and cleanup.

## Database Setup

Copy `.env.example` to `.env` and configure `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.

For Prisma Postgres, use the pooled URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`.

For a local or hosted PostgreSQL database:

```bash
npm run db:generate
npm run db:migrate
npm run seed
```

Without a signed-in database session, the app falls back to the local demo dashboard. After sign-in, Runbook Studio creates a workspace for the user, copies the starter services/runbooks, and saves incident and runbook workflows through Prisma-backed server actions.

## Production Readiness

Deploy with these production environment variables:

- `DATABASE_URL`: pooled Prisma Postgres connection string.
- `DIRECT_URL`: direct Prisma Postgres connection string for migrations and smoke cleanup.
- `BETTER_AUTH_SECRET`: long random secret, different from local development.
- `BETTER_AUTH_URL`: exact deployed origin, for example `https://runbook-studio.example.com`.

Apply database migrations before starting production traffic:

```bash
npm run db:deploy
```

After deployment, run the same smoke test against the deployed URL:

```bash
SMOKE_BASE_URL="https://your-production-url" npm run smoke:db
```

## Product Direction

The MVP now covers persisted incident response, runbook editing, service management, team invitations, role-aware permissions, and post-incident reporting. The next backend phase should add background reminders and escalation rules with Redis/BullMQ, then external notifications such as Slack or email.

See [docs/ROADMAP.md](docs/ROADMAP.md).
