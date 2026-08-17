import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationSchema, updateMemberRoleSchema } from "../src/domain/team/schema.js";

test("validates invitation payloads and normalizes email", () => {
  const result = createInvitationSchema.safeParse({
    email: " Teammate@Example.com ",
    role: "RESPONDER",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.email, "teammate@example.com");
});

test("does not allow owner invitation role", () => {
  const result = createInvitationSchema.safeParse({
    email: "owner@example.com",
    role: "OWNER",
  });

  assert.equal(result.success, false);
});

test("validates member role updates", () => {
  const result = updateMemberRoleSchema.safeParse({
    userId: "maya",
    role: "INCIDENT_COMMANDER",
  });

  assert.equal(result.success, true);
});
