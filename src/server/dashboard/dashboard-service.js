import { prisma } from "@/server/db/prisma";
import { runbooks as sampleRunbooks, services as sampleServices } from "@/lib/sample-data";

const serviceMeta = new Map(sampleServices.map((service) => [service.id, service]));

export async function getDashboardForUser(userId) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: dashboardInclude(),
  });

  return membership ? mapOrganizationToDashboard(membership.organization) : null;
}

export async function getOrCreateDashboardForUser(user) {
  const existing = await getDashboardForUser(user.id);

  if (existing) {
    return existing;
  }

  try {
    await createWorkspaceForUser(user);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  return waitForDashboardForUser(user.id);
}

export async function getMembershipForUser(userId) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });
}

function dashboardInclude() {
  return {
    organization: {
      include: {
        memberships: {
          orderBy: { createdAt: "asc" },
          include: { user: true },
        },
        services: {
          orderBy: [{ tier: "asc" }, { name: "asc" }],
        },
        runbooks: {
          orderBy: { updatedAt: "desc" },
          include: {
            steps: {
              orderBy: { position: "asc" },
            },
          },
        },
        incidents: {
          orderBy: { startedAt: "desc" },
          include: {
            service: true,
            runbook: true,
            commander: true,
            steps: {
              orderBy: { position: "asc" },
            },
            notes: {
              orderBy: { createdAt: "desc" },
              include: { author: true },
            },
            timeline: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    },
  };
}

async function createWorkspaceForUser(user) {
  const suffix = user.id.toLowerCase().replace(/[^a-z0-9]/g, "") || "workspace";
  const organization = await prisma.organization.create({
    data: {
      name: `${user.name || "Personal"} Operations`,
      slug: `workspace-${suffix}`,
    },
  });

  const serviceIdMap = new Map();

  for (const service of sampleServices) {
    const serviceId = `${organization.id}-${service.id}`;
    serviceIdMap.set(service.id, serviceId);
    await prisma.service.create({
      data: {
        id: serviceId,
        organizationId: organization.id,
        name: service.name,
        slug: service.id,
        tier: toDbTier(service.tier),
        status: toDbServiceStatus(service.status),
        owner: service.owner,
      },
    });
  }

  for (const runbook of sampleRunbooks) {
    const runbookId = `${organization.id}-${runbook.id}`;
    await prisma.runbook.create({
      data: {
        id: runbookId,
        organizationId: organization.id,
        serviceId: serviceIdMap.get(runbook.serviceId),
        title: runbook.title,
        summary: runbook.summary,
        defaultSeverity: toDbSeverity(runbook.defaultSeverity),
        estimatedMinutes: runbook.estimatedMinutes,
        steps: {
          create: runbook.steps.map((step, index) => ({
            id: `${runbookId}-${step.id}`,
            position: index + 1,
            title: step.title,
            detail: step.detail,
            role: step.role,
            required: step.required,
            timeboxMinutes: step.timeboxMinutes,
          })),
        },
      },
    });
  }

  await prisma.membership.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  return organization;
}

async function waitForDashboardForUser(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dashboard = await getDashboardForUser(userId);

    if (dashboard) {
      return dashboard;
    }

    await delay(100 * (attempt + 1));
  }

  return getDashboardForUser(userId);
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function mapOrganizationToDashboard(organization) {
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    services: organization.services.map(mapService),
    runbooks: organization.runbooks.map(mapRunbook),
    incidents: organization.incidents.map(mapIncident),
    teamMembers: organization.memberships.map(mapMembership),
  };
}

function mapMembership(membership) {
  return {
    id: membership.user.id,
    name: membership.user.name,
    role: membership.role.toLowerCase().replaceAll("_", " "),
    initials: getInitials(membership.user.name),
  };
}

function mapService(service) {
  const meta = serviceMeta.get(service.slug);

  return {
    id: service.id,
    name: service.name,
    owner: service.owner,
    tier: toUiTier(service.tier),
    status: toUiStatus(service.status),
    slo: meta?.slo ?? "99.90%",
    openIncidents: 0,
    lastDeploy: meta?.lastDeploy ?? null,
  };
}

function mapRunbook(runbook) {
  return {
    id: runbook.id,
    title: runbook.title,
    summary: runbook.summary,
    serviceId: runbook.serviceId,
    defaultSeverity: toUiSeverity(runbook.defaultSeverity),
    estimatedMinutes: runbook.estimatedMinutes,
    tags: [],
    steps: runbook.steps.map((step) => ({
      id: step.id,
      title: step.title,
      detail: step.detail,
      role: step.role,
      required: step.required,
      timeboxMinutes: step.timeboxMinutes,
    })),
  };
}

function mapIncident(incident) {
  return {
    id: incident.id,
    title: incident.title,
    serviceId: incident.serviceId,
    runbookId: incident.runbookId,
    severity: toUiSeverity(incident.severity),
    status: toUiStatus(incident.status),
    commanderId: incident.commanderId,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    summary: incident.summary ?? "",
    steps: incident.steps.map((step) => ({
      id: step.id,
      title: step.title,
      detail: step.detail,
      role: step.role,
      required: step.required,
      position: step.position,
      status: toUiStatus(step.status),
      assigneeId: step.assigneeId,
      completedAt: step.completedAt?.toISOString() ?? null,
    })),
    timeline: incident.timeline.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      actorId: event.actorId,
      createdAt: event.createdAt.toISOString(),
    })),
    notes: incident.notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorId: note.authorId,
      createdAt: note.createdAt.toISOString(),
    })),
  };
}

export function toDbSeverity(value) {
  return value.replace("-", "_").toUpperCase();
}

export function toDbStepStatus(value) {
  return value.toUpperCase();
}

function toDbTier(value) {
  return value.toUpperCase().replace(" ", "_");
}

function toDbServiceStatus(value) {
  return value.toUpperCase();
}

function toUiSeverity(value) {
  return value.replace("_", "-");
}

function toUiStatus(value) {
  return value.toLowerCase();
}

function toUiTier(value) {
  return value.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
