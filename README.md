# Runbook Studio

Runbook Studio is a fullstack incident runbook workspace for operational teams. It is designed as a portfolio-grade product surface for incident response, service health, reusable runbooks, audit timelines, and operational reporting.

## Current Slice

- Operations dashboard with active incidents, service health, and runbook coverage.
- Incident workspace with severity, commander, timeline, notes, and assigned checklist steps.
- Reusable runbook library that can launch new incidents.
- Local browser persistence for demo workflows.
- Pure workflow rules covered by Node tests.
- Prisma schema for the planned PostgreSQL-backed backend.
- Playwright smoke test for the core dashboard surface.

## Stack

- Next.js App Router
- React
- Node test runner
- Playwright
- Prisma/PostgreSQL backend direction
- Better Auth direction
- Zod validation direction

## Local Development

```bash
npm install
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

## Product Direction

The next backend phase should add Better Auth, organization membership, PostgreSQL persistence, and server-side mutations for incidents, runbooks, and timeline events. After that, background reminders and escalation rules can move into a Redis/BullMQ worker.

See [docs/ROADMAP.md](docs/ROADMAP.md).
