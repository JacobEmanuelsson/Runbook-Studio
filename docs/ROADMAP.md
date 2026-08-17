# Runbook Studio Roadmap

## Phase 1: Local Product Slice

- Build the incident operations dashboard.
- Seed believable services, runbooks, team members, and incidents.
- Support local incident launch, checklist updates, notes, and resolution.
- Add workflow unit tests and an e2e smoke test.

## Phase 2: Persistence And Auth

- Add Better Auth.
- Add organization membership and role checks.
- Persist services, runbooks, incidents, notes, and timeline events in PostgreSQL.
- Move client mutations into server actions with Zod validation.

## Phase 3: Operational Automation

- Add Redis and BullMQ.
- Schedule stale-incident reminders.
- Add escalation rules by severity and service tier.
- Record all worker actions as timeline events.

## Phase 4: Integrations

- Add a signed webhook endpoint for GitHub incidents.
- Add Slack or email notifications.
- Add status-page style public incident summaries.

## Phase 5: Reporting

- Add MTTR trends.
- Track runbook completion rates.
- Surface noisy services and recurring incident categories.

