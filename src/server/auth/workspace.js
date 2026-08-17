import { getCurrentUser } from "@/server/auth/require-session";
import { prisma } from "@/server/db/prisma";

export const ROLE_GROUPS = {
  owner: ["OWNER"],
  incidentResponder: ["OWNER", "INCIDENT_COMMANDER", "RESPONDER"],
  incidentCommander: ["OWNER", "INCIDENT_COMMANDER"],
};

const roleLabels = {
  OWNER: "owner",
  INCIDENT_COMMANDER: "incident commander",
  RESPONDER: "responder",
  VIEWER: "viewer",
};

export async function requireWorkspace({ allowedRoles = [], action = "perform this action" } = {}) {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, error: "Sign in to use the saved workspace." };
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (!membership) {
    return { ok: false, error: "No workspace found for this user." };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
    return {
      ok: false,
      error: `Your ${formatRole(membership.role)} role cannot ${action}.`,
    };
  }

  return { ok: true, user, membership, organization: membership.organization };
}

export function formatRole(role) {
  return roleLabels[role] ?? role.toLowerCase().replaceAll("_", " ");
}
