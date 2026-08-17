"use server";

import { revalidatePath } from "next/cache";
import { deleteRunbookSchema, saveRunbookSchema } from "@/domain/runbooks/schema";
import { getCurrentUser } from "@/server/auth/require-session";
import { getMembershipForUser, toDbSeverity } from "@/server/dashboard/dashboard-service";
import { prisma } from "@/server/db/prisma";

export async function saveRunbookAction(input) {
  const parsed = parseInput(saveRunbookSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace();

  if (!workspace.ok) {
    return workspace;
  }

  try {
    const runbook = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findFirst({
        where: {
          id: parsed.data.serviceId,
          organizationId: workspace.membership.organizationId,
        },
        select: { id: true },
      });

      if (!service) {
        throw new ActionFailure("Service is not available in this workspace.");
      }

      let runbookId = parsed.data.id ?? null;

      if (runbookId) {
        const existing = await tx.runbook.findFirst({
          where: {
            id: runbookId,
            organizationId: workspace.membership.organizationId,
          },
          select: { id: true },
        });

        if (!existing) {
          throw new ActionFailure("Runbook is not available in this workspace.");
        }

        await tx.runbook.update({
          where: { id: runbookId },
          data: runbookData(parsed.data),
        });
      } else {
        const created = await tx.runbook.create({
          data: {
            organizationId: workspace.membership.organizationId,
            ...runbookData(parsed.data),
          },
          select: { id: true },
        });
        runbookId = created.id;
      }

      await tx.runbookStep.deleteMany({
        where: { runbookId },
      });

      await tx.runbookStep.createMany({
        data: parsed.data.steps.map((step, index) => ({
          runbookId,
          position: index + 1,
          title: step.title,
          detail: step.detail,
          role: step.role,
          required: step.required,
          timeboxMinutes: step.timeboxMinutes ?? null,
        })),
      });

      return { id: runbookId };
    });

    revalidatePath("/");
    return { ok: true, runbookId: runbook.id };
  } catch (error) {
    return actionFailure(error, "Could not save runbook.");
  }
}

export async function deleteRunbookAction(input) {
  const parsed = parseInput(deleteRunbookSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace();

  if (!workspace.ok) {
    return workspace;
  }

  try {
    const result = await prisma.runbook.deleteMany({
      where: {
        id: parsed.data.runbookId,
        organizationId: workspace.membership.organizationId,
      },
    });

    if (result.count === 0) {
      throw new ActionFailure("Runbook is not available in this workspace.");
    }

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not delete runbook.");
  }
}

async function requireWorkspace() {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, error: "Sign in to save runbook changes." };
  }

  const membership = await getMembershipForUser(user.id);

  if (!membership) {
    return { ok: false, error: "No workspace found for this user." };
  }

  return { ok: true, user, membership };
}

function runbookData(input) {
  return {
    serviceId: input.serviceId,
    title: input.title,
    summary: input.summary,
    defaultSeverity: toDbSeverity(input.defaultSeverity),
    estimatedMinutes: input.estimatedMinutes,
  };
}

function parseInput(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid runbook input." };
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
