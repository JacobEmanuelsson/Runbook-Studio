import assert from "node:assert/strict";
import test from "node:test";
import {
  assignStepSchema,
  incidentNoteSchema,
  incidentReportSchema,
  launchIncidentSchema,
  updateStepSchema,
} from "../src/domain/incidents/schema.js";

test("validates launch incident input", () => {
  const result = launchIncidentSchema.safeParse({
    title: "Public API error spike",
    serviceId: "public-api",
    runbookId: "api-error-spike",
    severity: "SEV-2",
  });

  assert.equal(result.success, true);
});

test("rejects empty incident notes", () => {
  const result = incidentNoteSchema.safeParse({
    incidentId: "inc-1042",
    body: "   ",
  });

  assert.equal(result.success, false);
});

test("validates checklist step updates", () => {
  const result = updateStepSchema.safeParse({
    incidentId: "inc-1042",
    stepId: "inc-1042-queue-drain",
    status: "blocked",
    assigneeId: null,
  });

  assert.equal(result.success, true);
});

test("validates checklist assignment updates", () => {
  const result = assignStepSchema.safeParse({
    incidentId: "inc-1042",
    stepId: "inc-1042-queue-drain",
    assigneeId: "leo",
  });

  assert.equal(result.success, true);
});

test("validates post-incident report payloads", () => {
  const result = incidentReportSchema.safeParse({
    incidentId: "inc-1042",
    summary: "Payment processor latency recovered after queue pressure dropped.",
    impactSummary: "Checkout latency was elevated for a subset of EU users.",
    rootCause: "Processor webhook retries saturated a worker pool.",
    resolutionSummary: "Paused replay jobs and drained payment retries.",
    followUpActions: "Add queue saturation alerting before the next launch.",
  });

  assert.equal(result.success, true);
});
