import assert from "node:assert/strict";
import test from "node:test";
import { getAverageResolutionMinutes, getRunbookCoverage, getStepProgress } from "../src/lib/incident-metrics.js";
import { runbooks } from "../src/lib/sample-data.js";
import {
  canResolveIncident,
  createIncidentFromRunbook,
  resolveIncident,
  setStepStatus,
  updateIncidentReport,
} from "../src/lib/runbook-workflow.js";

test("creates an incident from a runbook with pending steps and an opening event", () => {
  const runbook = runbooks[0];
  const incident = createIncidentFromRunbook({
    id: "inc-test",
    runbook,
    commanderId: "maya",
    createdAt: "2026-08-17T08:00:00.000Z",
  });

  assert.equal(incident.title, runbook.title);
  assert.equal(incident.steps.length, runbook.steps.length);
  assert.equal(incident.steps[0].status, "pending");
  assert.equal(incident.timeline[0].type, "opened");
  assert.equal(incident.status, "active");
});

test("marks a step done and appends a timeline event", () => {
  const incident = createIncidentFromRunbook({
    id: "inc-test",
    runbook: runbooks[0],
    commanderId: "maya",
    createdAt: "2026-08-17T08:00:00.000Z",
  });

  const updated = setStepStatus(incident, "inc-test-latency-confirm", "done", "maya", "2026-08-17T08:04:00.000Z");

  assert.equal(updated.steps[0].status, "done");
  assert.equal(updated.steps[0].completedAt, "2026-08-17T08:04:00.000Z");
  assert.equal(updated.timeline[0].type, "step_done");
});

test("prevents resolution while required steps remain open", () => {
  const incident = createIncidentFromRunbook({
    id: "inc-test",
    runbook: runbooks[0],
    commanderId: "maya",
  });

  const result = resolveIncident(incident, "maya", "2026-08-17T08:30:00.000Z");

  assert.equal(canResolveIncident(incident), false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "REQUIRED_STEPS_OPEN");
});

test("resolves when all required steps are done", () => {
  const incident = createIncidentFromRunbook({
    id: "inc-test",
    runbook: runbooks[2],
    commanderId: "maya",
  });

  const withDepthDone = setStepStatus(incident, "inc-test-queue-depth", "done", "maya", "2026-08-17T08:05:00.000Z");
  const withLogsDone = setStepStatus(withDepthDone, "inc-test-worker-logs", "done", "maya", "2026-08-17T08:15:00.000Z");
  const result = resolveIncident(withLogsDone, "maya", "2026-08-17T08:20:00.000Z");

  assert.equal(result.ok, true);
  assert.equal(result.incident.status, "resolved");
  assert.equal(result.incident.resolvedAt, "2026-08-17T08:20:00.000Z");
});

test("updates incident report fields and records a timeline event", () => {
  const incident = createIncidentFromRunbook({
    id: "inc-test",
    runbook: runbooks[1],
    commanderId: "maya",
  });

  const updated = updateIncidentReport(
    incident,
    {
      summary: "API error rate recovered after rollback.",
      impactSummary: "Some API clients saw failed token refreshes.",
      rootCause: "Validation config shipped before metadata rollout.",
      resolutionSummary: "Rolled back the config and replayed failures.",
      followUpActions: "Add tenant canary validation.",
    },
    "maya",
    "2026-08-17T08:35:00.000Z",
  );

  assert.equal(updated.summary, "API error rate recovered after rollback.");
  assert.equal(updated.rootCause, "Validation config shipped before metadata rollout.");
  assert.equal(updated.timeline[0].type, "report_updated");
});

test("calculates progress, coverage, and MTTR", () => {
  const incidents = [
    {
      startedAt: "2026-08-17T08:00:00.000Z",
      resolvedAt: "2026-08-17T08:30:00.000Z",
      runbookId: "queue-stall",
      status: "resolved",
      steps: [{ status: "done" }, { status: "pending" }],
    },
    {
      startedAt: "2026-08-17T09:00:00.000Z",
      resolvedAt: null,
      runbookId: null,
      status: "active",
      steps: [],
    },
  ];

  assert.deepEqual(getStepProgress(incidents[0]), { total: 2, done: 1, percent: 50 });
  assert.equal(getRunbookCoverage(incidents), 50);
  assert.equal(getAverageResolutionMinutes(incidents), 30);
});
