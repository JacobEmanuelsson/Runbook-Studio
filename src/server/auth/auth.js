import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/server/db/prisma";

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const authSecret = process.env.BETTER_AUTH_SECRET ?? "runbook-studio-local-development-secret";

if (process.env.NODE_ENV === "production" && !isProductionBuild && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be configured in production.");
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: authSecret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
  },
});
