"use server";

import { revalidatePath } from "next/cache";
import { deleteServiceSchema, saveServiceSchema } from "@/domain/services/schema";
import { requireWorkspace, ROLE_GROUPS } from "@/server/auth/workspace";
import { toDbServiceStatus, toDbTier } from "@/server/dashboard/dashboard-service";
import { prisma } from "@/server/db/prisma";

export async function saveServiceAction(input) {
  const parsed = parseInput(saveServiceSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.owner,
    action: "edit services",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    const service = await prisma.$transaction(async (tx) => {
      let serviceId = parsed.data.id ?? null;
      const slug = await uniqueServiceSlug(tx, {
        organizationId: workspace.membership.organizationId,
        name: parsed.data.name,
        currentServiceId: serviceId,
      });

      if (serviceId) {
        const existing = await tx.service.findFirst({
          where: {
            id: serviceId,
            organizationId: workspace.membership.organizationId,
          },
          select: { id: true },
        });

        if (!existing) {
          throw new ActionFailure("Service is not available in this workspace.");
        }

        await tx.service.update({
          where: { id: serviceId },
          data: serviceData(parsed.data, slug),
        });
      } else {
        const created = await tx.service.create({
          data: {
            organizationId: workspace.membership.organizationId,
            ...serviceData(parsed.data, slug),
          },
          select: { id: true },
        });
        serviceId = created.id;
      }

      return { id: serviceId };
    });

    revalidatePath("/");
    return { ok: true, serviceId: service.id };
  } catch (error) {
    return actionFailure(error, "Could not save service.");
  }
}

export async function deleteServiceAction(input) {
  const parsed = parseInput(deleteServiceSchema, input);

  if (!parsed.ok) {
    return parsed;
  }

  const workspace = await requireWorkspace({
    allowedRoles: ROLE_GROUPS.owner,
    action: "delete services",
  });

  if (!workspace.ok) {
    return workspace;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const service = await tx.service.findFirst({
        where: {
          id: parsed.data.serviceId,
          organizationId: workspace.membership.organizationId,
        },
        select: {
          id: true,
          _count: {
            select: {
              incidents: true,
              runbooks: true,
            },
          },
        },
      });

      if (!service) {
        throw new ActionFailure("Service is not available in this workspace.");
      }

      if (service._count.incidents > 0 || service._count.runbooks > 0) {
        throw new ActionFailure("Services with runbooks or incident history cannot be deleted.");
      }

      await tx.service.delete({
        where: { id: service.id },
      });
    });

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return actionFailure(error, "Could not delete service.");
  }
}

async function uniqueServiceSlug(tx, { organizationId, name, currentServiceId }) {
  const baseSlug = slugify(name) || "service";
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await tx.service.findFirst({
      where: {
        organizationId,
        slug,
        id: currentServiceId ? { not: currentServiceId } : undefined,
      },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function serviceData(input, slug) {
  return {
    name: input.name,
    slug,
    owner: input.owner,
    tier: toDbTier(input.tier),
    status: toDbServiceStatus(input.status),
    sloTarget: input.slo,
    lastDeployAt: input.lastDeploy ? new Date(input.lastDeploy) : null,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseInput(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid service input." };
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
