# Runbook Studio

Runbook Studio is a fullstack incident runbook workspace for operational teams. It is designed as a portfolio-grade product surface for incident response, service health, reusable runbooks, audit timelines, and operational reporting.

## Current Slice

- Operations dashboard with active incidents, service health, and runbook coverage.
- Incident workspace with severity, commander, timeline, notes, and assigned checklist steps.
- Reusable runbook library that can launch new incidents.
- Authenticated Prisma reads and server actions for launching incidents, checklist updates, assignments, notes, and resolution.
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
```

## Database Setup

Copy `.env.example` to `.env` and configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.

For a local or hosted PostgreSQL database:

```bash
npm run db:generate
npm run db:migrate
npm run seed
```

Without a signed-in database session, the app falls back to the local demo dashboard. After sign-in, Runbook Studio creates a workspace for the user, copies the starter services/runbooks, and saves incident workflows through Prisma-backed server actions.

## Product Direction

The next backend phase should add collaboration depth: inviting team members, editing runbook templates, and recording richer post-incident summaries. After that, background reminders and escalation rules can move into a Redis/BullMQ worker.

See [docs/ROADMAP.md](docs/ROADMAP.md).
