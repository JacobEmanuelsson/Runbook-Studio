import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

