import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/server/db/prisma";

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const authSecret = process.env.BETTER_AUTH_SECRET ?? "runbook-studio-local-development-secret";
const vercelAuthHost =
  process.env.VERCEL_ENV === "production"
    ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
    : process.env.VERCEL_URL;
const authBaseURL = process.env.BETTER_AUTH_URL ?? (vercelAuthHost ? `https://${vercelAuthHost}` : "http://localhost:3000");

if (process.env.NODE_ENV === "production" && !isProductionBuild && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be configured in production.");
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: authSecret,
  baseURL: authBaseURL,
  emailAndPassword: {
    enabled: true,
  },
});
