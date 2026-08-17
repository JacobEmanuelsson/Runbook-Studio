import { z } from "zod";

export const memberRoleSchema = z.enum(["OWNER", "INCIDENT_COMMANDER", "RESPONDER", "VIEWER"]);
export const inviteRoleSchema = z.enum(["INCIDENT_COMMANDER", "RESPONDER", "VIEWER"]);

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: inviteRoleSchema,
});

export const cancelInvitationSchema = z.object({
  invitationId: z.string().trim().min(1),
});

export const updateMemberRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: memberRoleSchema,
});
