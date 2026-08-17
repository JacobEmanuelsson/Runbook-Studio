"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cancelInvitationSchema, createInvitationSchema, updateMemberRoleSchema } from "@/domain/team/schema";
import { requireWorkspace, ROLE_GROUPS } from "@/server/auth/workspace";
import { prisma } from "@/server/db/prisma";

const INVITATION_DAYS = 14;

export async function createInvitationAction(input) {
  const parsed = parseInput(createInvitationSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.owner,
    action: "invite teammates",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    const invitation = await prisma.$transaction(async (tx) => {
      const existingMember = await tx.membership.findFirst({
        where: {
          organizationId: workspace.membership.organizationId,
          user: {
            email: parsed.data.email,
          },
        },
        select: { id: true },
      });

      if (existingMember) {
        throw new ActionFailure("That email is already a workspace member.");
      }

      await tx.invitation.updateMany({
        where: {
          organizationId: workspace.membership.organizationId,
          email: parsed.data.email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          expiresAt: new Date(),
        },
      });

      return tx.invitation.create({
        data: {
          organizationId: workspace.membership.organizationId,
          email: parsed.data.email,
          role: parsed.data.role,
          token: randomUUID(),
          expiresAt: daysFromNow(INVITATION_DAYS),
          createdById: workspace.user.id,
        },
        select: { id: true },
      });
    });

    revalidatePath("/");
    return { ok: true, invitationId: invitation.id };
  } catch (error) {
    return actionFailure(error, "Could not create invitation.");
  }
}

export async function cancelInvitationAction(input) {
  const parsed = parseInput(cancelInvitationSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.owner,
    action: "manage invitations",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.invitation.deleteMany({
      where: {
        id: parsed.data.invitationId,
        organizationId: workspace.membership.organizationId,
        acceptedAt: null,
      },
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not cancel invitation.");
  }
}

export async function updateMemberRoleAction(input) {
  const parsed = parseInput(updateMemberRoleSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.owner,
    action: "manage member roles",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const targetMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: workspace.membership.organizationId,
            userId: parsed.data.userId,
          },
        },
        select: { id: true, userId: true, role: true },
      });

      if (!targetMembership) {
        throw new ActionFailure("Member is not available in this workspace.");
      }

      if (targetMembership.role === "OWNER" && parsed.data.role !== "OWNER") {
        const ownerCount = await tx.membership.count({
          where: {
            organizationId: workspace.membership.organizationId,
            role: "OWNER",
          },
        });

        if (ownerCount <= 1) {
          throw new ActionFailure("A workspace must keep at least one owner.");
        }
      }

      await tx.membership.update({
        where: { id: targetMembership.id },
        data: { role: parsed.data.role },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not update member role.");
  }
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function parseInput(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid team input." };
  }

  return { ok: true, data: result.data };
}

function actionFailure(error, fallback) {
  if (error instanceof ActionFailure) {
    return { ok: false, error: error.message };
  }

  console.error(error);
  return { ok: false, error: fallback };
}

class ActionFailure extends Error {}
