import assert from "node:assert/strict";
import test from "node:test";
import { deleteServiceSchema, saveServiceSchema } from "../src/domain/services/schema.js";

test("validates service editor payloads", () => {
  const result = saveServiceSchema.safeParse({
    name: "Billing API",
    owner: "Revenue Systems",
    tier: "Tier 1",
    status: "healthy",
    slo: "99.95%",
    lastDeploy: "2026-08-17T10:30:00.000Z",
  });

  assert.equal(result.success, true);
});

test("rejects invalid service status values", () => {
  const result = saveServiceSchema.safeParse({
    name: "Billing API",
    owner: "Revenue Systems",
    tier: "Tier 1",
    status: "offline",
    slo: "99.95%",
    lastDeploy: null,
  });

  assert.equal(result.success, false);
});

test("validates service deletion payloads", () => {
  const result = deleteServiceSchema.safeParse({
    serviceId: "payments",
  });

  assert.equal(result.success, true);
});
