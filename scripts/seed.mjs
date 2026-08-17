import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { initialIncidents, runbooks, services, teamMembers } from "../src/lib/sample-data.js";

const ORGANIZATION_ID = "org-runbook-studio";
const ORGANIZATION_SLUG = "runbook-studio";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured before running the seed script.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

await seed();
await prisma.$disconnect();

async function seed() {
  await prisma.organization.deleteMany({
    where: { id: ORGANIZATION_ID },
  });

  for (const member of teamMembers) {
    await prisma.user.upsert({
      where: { id: member.id },
      update: {
        name: member.name,
        email: demoEmail(member),
        emailVerified: true,
      },
      create: {
        id: member.id,
        name: member.name,
        email: demoEmail(member),
        emailVerified: true,
      },
    });
  }

  await prisma.organization.create({
    data: {
      id: ORGANIZATION_ID,
      name: "Runbook Studio Demo",
      slug: ORGANIZATION_SLUG,
    },
  });

  for (const member of teamMembers) {
    await prisma.membership.create({
      data: {
        organizationId: ORGANIZATION_ID,
        userId: member.id,
        role: roleForMember(member.id),
      },
    });
  }

  for (const service of services) {
    await prisma.service.create({
      data: {
        id: service.id,
        organizationId: ORGANIZATION_ID,
        name: service.name,
        slug: service.id,
        tier: service.tier.toUpperCase().replace(" ", "_"),
        status: service.status.toUpperCase(),
        owner: service.owner,
        sloTarget: service.slo,
        lastDeployAt: service.lastDeploy,
      },
    });
  }

  for (const runbook of runbooks) {
    await prisma.runbook.create({
      data: {
        id: runbook.id,
        organizationId: ORGANIZATION_ID,
        serviceId: runbook.serviceId,
        title: runbook.title,
        summary: runbook.summary,
        defaultSeverity: toSeverityEnum(runbook.defaultSeverity),
        estimatedMinutes: runbook.estimatedMinutes,
        steps: {
          create: runbook.steps.map((step, index) => ({
            id: step.id,
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

  for (const incident of initialIncidents) {
    await prisma.incident.create({
      data: {
        id: incident.id,
        organizationId: ORGANIZATION_ID,
        serviceId: incident.serviceId,
        runbookId: incident.runbookId,
        commanderId: incident.commanderId,
        title: incident.title,
        severity: toSeverityEnum(incident.severity),
        status: incident.status.toUpperCase(),
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        summary: incident.summary || null,
        impactSummary: incident.impactSummary || null,
        rootCause: incident.rootCause || null,
        resolutionSummary: incident.resolutionSummary || null,
        followUpActions: incident.followUpActions || null,
        steps: {
          create: incident.steps.map((step, index) => ({
            id: step.id,
            position: index + 1,
            title: step.title,
            detail: step.detail,
            role: step.role,
            required: step.required,
            status: step.status.toUpperCase(),
            assigneeId: step.assigneeId,
            completedAt: step.completedAt,
          })),
        },
        notes: {
          create: incident.notes.map((note) => ({
            id: note.id,
            authorId: note.authorId,
            body: note.body,
            createdAt: note.createdAt,
          })),
        },
        timeline: {
          create: incident.timeline.map((event) => ({
            id: event.id,
            type: event.type,
            message: event.message,
            actorId: event.actorId,
            createdAt: event.createdAt,
          })),
        },
      },
    });
  }

  console.log("Seeded Runbook Studio demo workspace.");
}

function demoEmail(member) {
  return `${member.id}@runbook.studio`;
}

function roleForMember(memberId) {
  if (memberId === "maya") {
    return "INCIDENT_COMMANDER";
  }

  if (memberId === "sam") {
    return "VIEWER";
  }

  return "RESPONDER";
}

function toSeverityEnum(value) {
  return value.replace("-", "_");
}
