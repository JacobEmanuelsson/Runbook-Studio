# Runbook Studio Roadmap

## Phase 1: Local Product Slice

- Build the incident operations dashboard.
- Seed believable services, runbooks, team members, and incidents.
- Support local incident launch, checklist updates, notes, and resolution.
- Add workflow unit tests and an e2e smoke test.

## Phase 2: Persistence And Auth

- Add Better Auth. Done.
- Add Prisma/PostgreSQL schema for organization membership and incident data. Done.
- Add a database seed script for the demo workspace. Done.
- Persist services, runbooks, incidents, notes, and timeline events in PostgreSQL-backed pages. Done.
- Move client mutations into server actions with Zod validation. Done.

## Phase 3: Runbook Editing

- Create and edit runbook templates in the app. Done.
- Reorder, add, and remove checklist steps. Done.
- Save runbook templates through authenticated server actions. Done.

## Phase 4: Collaboration And Post-Incident Work

- Invite teammates into an organization.
- Add role-aware permissions for responders, commanders, and viewers.
- Capture post-incident summaries and follow-up actions.

## Phase 5: Operational Automation

- Add Redis and BullMQ.
- Schedule stale-incident reminders.
- Add escalation rules by severity and service tier.
- Record all worker actions as timeline events.

## Phase 6: Integrations

- Add a signed webhook endpoint for GitHub incidents.
- Add Slack or email notifications.
- Add status-page style public incident summaries.

## Phase 7: Reporting

- Add MTTR trends.
- Track runbook completion rates.
- Surface noisy services and recurring incident categories.
