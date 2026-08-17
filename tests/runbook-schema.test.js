import assert from "node:assert/strict";
import test from "node:test";
import { deleteRunbookSchema, saveRunbookSchema } from "../src/domain/runbooks/schema.js";

test("validates runbook editor payloads", () => {
  const result = saveRunbookSchema.safeParse({
    id: "api-error-spike",
    title: "Public API error spike",
    summary: "Isolate an API error spike by endpoint, deployment, tenant, and dependency.",
    serviceId: "public-api",
    defaultSeverity: "SEV-2",
    estimatedMinutes: "30",
    steps: [
      {
        id: "api-scope",
        title: "Scope affected endpoints",
        detail: "Group errors by endpoint, status code, tenant, and region.",
        role: "Incident commander",
        required: true,
        timeboxMinutes: "7",
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.data.estimatedMinutes, 30);
  assert.equal(result.data.steps[0].timeboxMinutes, 7);
});

test("rejects runbooks without checklist steps", () => {
  const result = saveRunbookSchema.safeParse({
    title: "Too empty",
    summary: "This should not be launchable without checklist steps.",
    serviceId: "public-api",
    defaultSeverity: "SEV-3",
    estimatedMinutes: 15,
    steps: [],
  });

  assert.equal(result.success, false);
});

test("validates runbook deletion payloads", () => {
  const result = deleteRunbookSchema.safeParse({
    runbookId: "queue-stall",
  });

  assert.equal(result.success, true);
});
