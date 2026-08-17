"use server";

import { revalidatePath } from "next/cache";
import {
  assignStepSchema,
  incidentReportSchema,
  incidentNoteSchema,
  launchIncidentSchema,
  resolveIncidentSchema,
  updateStepSchema,
} from "@/domain/incidents/schema";
import { requireWorkspace, ROLE_GROUPS } from "@/server/auth/workspace";
import { toDbSeverity, toDbStepStatus } from "@/server/dashboard/dashboard-service";
import { prisma } from "@/server/db/prisma";

const stepStatusLabels = {
  pending: "moved to pending",
  in_progress: "started",
  blocked: "blocked",
  done: "completed",
};

export async function launchIncidentAction(input) {
  const parsed = parseInput(launchIncidentSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.incidentResponder,
    action: "launch incidents",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    const incident = await prisma.$transaction(async (tx) => {
      const [service, runbook] = await Promise.all([
        tx.service.findFirst({
          where: {
            id: parsed.data.serviceId,
            organizationId: workspace.membership.organizationId,
          },
          select: { id: true },
        }),
        tx.runbook.findFirst({
          where: {
            id: parsed.data.runbookId,
            organizationId: workspace.membership.organizationId,
          },
          include: {
            steps: {
              orderBy: { position: "asc" },
            },
          },
        }),
      ]);

      if (!service) {
        throw new ActionFailure("Service is not available in this workspace.");
      }

      if (!runbook) {
        throw new ActionFailure("Runbook is not available in this workspace.");
      }

      if (runbook.serviceId && runbook.serviceId !== service.id) {
        throw new ActionFailure("Runbook is attached to a different service.");
      }

      const openedAt = new Date();
      return tx.incident.create({
        data: {
          organizationId: workspace.membership.organizationId,
          serviceId: service.id,
          runbookId: runbook.id,
          commanderId: workspace.user.id,
          title: parsed.data.title,
          severity: toDbSeverity(parsed.data.severity),
          status: "ACTIVE",
          startedAt: openedAt,
          summary: "",
          steps: {
            create: runbook.steps.map((step, index) => ({
              position: index + 1,
              title: step.title,
              detail: step.detail,
              role: step.role,
              required: step.required,
              status: "PENDING",
            })),
          },
          timeline: {
            create: {
              type: "opened",
              message: `Incident opened from ${runbook.title}.`,
              actorId: workspace.user.id,
              createdAt: openedAt,
            },
          },
        },
        select: { id: true },
      });
    });

    revalidatePath("/");
    return { ok: true, incidentId: incident.id };
  } catch (error) {
    return actionFailure(error, "Could not launch incident.");
  }
}

export async function updateIncidentStepAction(input) {
  const parsed = parseInput(updateStepSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.incidentResponder,
    action: "update incidents",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { incident, step } = await getIncidentStep(tx, {
        incidentId: parsed.data.incidentId,
        organizationId: workspace.membership.organizationId,
        stepId: parsed.data.stepId,
      });

      if ("assigneeId" in parsed.data) {
        await requireWorkspaceMember(tx, workspace.membership.organizationId, parsed.data.assigneeId);
      }

      const changedAt = new Date();
      const updateData = {
        status: toDbStepStatus(parsed.data.status),
        completedAt: parsed.data.status === "done" ? changedAt : null,
      };

      if ("assigneeId" in parsed.data) {
        updateData.assigneeId = parsed.data.assigneeId;
      }

      await tx.incidentStep.update({
        where: { id: step.id },
        data: updateData,
      });

      await tx.timelineEvent.create({
        data: {
          incidentId: incident.id,
          type: stepEventType(parsed.data.status),
          message: `${step.title} ${stepStatusLabels[parsed.data.status] ?? "updated"}.`,
          actorId: workspace.user.id,
          createdAt: changedAt,
        },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not update checklist step.");
  }
}

export async function assignIncidentStepAction(input) {
  const parsed = parseInput(assignStepSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.incidentResponder,
    action: "assign incident steps",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { incident, step } = await getIncidentStep(tx, {
        incidentId: parsed.data.incidentId,
        organizationId: workspace.membership.organizationId,
        stepId: parsed.data.stepId,
      });
      const assignee = await requireWorkspaceMember(tx, workspace.membership.organizationId, parsed.data.assigneeId);

      await tx.incidentStep.update({
        where: { id: step.id },
        data: {
          assigneeId: parsed.data.assigneeId,
        },
      });

      await tx.timelineEvent.create({
        data: {
          incidentId: incident.id,
          type: "assignment",
          message: assignee ? `${step.title} assigned to ${assignee.user.name}.` : `${step.title} assignment cleared.`,
          actorId: workspace.user.id,
        },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not update step assignment.");
  }
}

export async function addIncidentNoteAction(input) {
  const parsed = parseInput(incidentNoteSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.incidentResponder,
    action: "add incident notes",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const incident = await tx.incident.findFirst({
        where: {
          id: parsed.data.incidentId,
          organizationId: workspace.membership.organizationId,
        },
        select: { id: true },
      });

      if (!incident) {
        throw new ActionFailure("Incident is not available in this workspace.");
      }

      await tx.incidentNote.create({
        data: {
          incidentId: incident.id,
          authorId: workspace.user.id,
          body: parsed.data.body,
        },
      });

      await tx.timelineEvent.create({
        data: {
          incidentId: incident.id,
          type: "note",
          message: "Incident note added.",
          actorId: workspace.user.id,
        },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not add incident note.");
  }
}

export async function resolveIncidentAction(input) {
  const parsed = parseInput(resolveIncidentSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.incidentCommander,
    action: "resolve incidents",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const incident = await tx.incident.findFirst({
        where: {
          id: parsed.data.incidentId,
          organizationId: workspace.membership.organizationId,
        },
        include: {
          steps: true,
        },
      });

      if (!incident) {
        throw new ActionFailure("Incident is not available in this workspace.");
      }

      if (incident.status === "RESOLVED") {
        return;
      }

      const hasOpenRequiredStep = incident.steps.some((step) => step.required && step.status !== "DONE");

      if (hasOpenRequiredStep) {
        throw new ActionFailure("Required steps are still open.");
      }

      const resolvedAt = new Date();
      await tx.incident.update({
        where: { id: incident.id },
        data: {
          status: "RESOLVED",
          resolvedAt,
        },
      });

      await tx.timelineEvent.create({
        data: {
          incidentId: incident.id,
          type: "resolved",
          message: "Incident resolved.",
          actorId: workspace.user.id,
          createdAt: resolvedAt,
        },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not resolve incident.");
  }
}

export async function saveIncidentReportAction(input) {
  const parsed = parseInput(incidentReportSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.incidentCommander,
    action: "edit incident reports",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const incident = await tx.incident.findFirst({
        where: {
          id: parsed.data.incidentId,
          organizationId: workspace.membership.organizationId,
        },
        select: { id: true },
      });

      if (!incident) {
        throw new ActionFailure("Incident is not available in this workspace.");
      }

      await tx.incident.update({
        where: { id: incident.id },
        data: {
          summary: emptyToNull(parsed.data.summary),
          impactSummary: emptyToNull(parsed.data.impactSummary),
          rootCause: emptyToNull(parsed.data.rootCause),
          resolutionSummary: emptyToNull(parsed.data.resolutionSummary),
          followUpActions: emptyToNull(parsed.data.followUpActions),
        },
      });

      await tx.timelineEvent.create({
        data: {
          incidentId: incident.id,
          type: "report_updated",
          message: "Post-incident report updated.",
          actorId: workspace.user.id,
        },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not save incident report.");
  }
}

async function getIncidentStep(tx, { incidentId, organizationId, stepId }) {
  const incident = await tx.incident.findFirst({
    where: {
      id: incidentId,
      organizationId,
    },
    select: { id: true },
  });

  if (!incident) {
    throw new ActionFailure("Incident is not available in this workspace.");
  }

  const step = await tx.incidentStep.findFirst({
    where: {
      id: stepId,
      incidentId: incident.id,
    },
    select: { id: true, title: true },
  });

  if (!step) {
    throw new ActionFailure("Checklist step is not available for this incident.");
  }

  return { incident, step };
}

async function requireWorkspaceMember(tx, organizationId, userId) {
  if (!userId) {
    return null;
  }

  const membership = await tx.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      id: true,
      user: {
        select: { name: true },
      },
    },
  });

  if (!membership) {
    throw new ActionFailure("Assignee is not a member of this workspace.");
  }

  return membership;
}

function parseInput(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid incident input." };
  }

  return { ok: true, data: result.data };
}

function emptyToNull(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function actionFailure(error, fallback) {
  if (error instanceof ActionFailure) {
    return { ok: false, error: error.message };
  }

  console.error(error);
  return { ok: false, error: fallback };
}

function stepEventType(status) {
  if (status === "done") {
    return "step_done";
  }

  if (status === "blocked") {
    return "step_blocked";
  }

  return "step_updated";
}

class ActionFailure extends Error {}
