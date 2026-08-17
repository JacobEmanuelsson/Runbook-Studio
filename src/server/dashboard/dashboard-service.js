import { prisma } from "@/server/db/prisma";

export async function getDashboardForUser(userId) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      organization: {
        include: {
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
              steps: true,
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
    },
  });

  return membership?.organization ?? null;
}

