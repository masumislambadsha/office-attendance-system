import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, getMongoClient } from "@/lib/mongo";
import { roleForEmail } from "@/attend/roles";
import type { Role } from "@/attend/types";

let _auth: ReturnType<typeof createAuth> | null = null;

const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Origins better-auth accepts a request from.
 *
 * `BETTER_AUTH_TRUSTED_ORIGINS` lists them explicitly (dev tunnels, a staging
 * host, …); the Vercel aliases are added automatically because preview
 * deployments get a random host that nobody can hard-code in the dashboard.
 */
function trustedOrigins(): string[] {
  const origins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.push(`https://${host}`);
  }
  return origins;
}

function createAuth() {
  return betterAuth({
    database: mongodbAdapter(getDb(), { client: getMongoClient(), transaction: false }),
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    trustedOrigins: trustedOrigins(),
    secret: process.env.BETTER_AUTH_SECRET,
    advanced: {
      database: {
        generateId: () => randomBytes(12).toString("hex"),
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          input: false,
          output: true,
          defaultValue: "employee",
        },
      },
    },
    ...(hasGoogle
      ? {
          socialProviders: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID!,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            },
          },
        }
      : {}),
  });
}

export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: Role | null;
}

export async function currentSession() {
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: Object.fromEntries(h.entries()) });
  if (!session?.user?.email) return null;
  const role = await roleForEmail(session.user.email);
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role,
    } satisfies AuthUser,
  };
}

export async function requireEmployee(): Promise<AuthUser> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s.user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.user.role !== "admin") redirect("/me");
  return s.user;
}