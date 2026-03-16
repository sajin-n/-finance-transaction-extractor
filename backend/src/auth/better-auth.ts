import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../prisma";

console.log("[BETTER-AUTH] Initializing...");

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const defaultBaseURL = `http://localhost:${PORT}`;
const resolvedBaseURL = process.env.BETTER_AUTH_URL || defaultBaseURL;
const trustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://finance-transaction-extractor.vercel.app",
  process.env.FRONTEND_URL,
  process.env.NEXTAUTH_URL,
].filter(Boolean) as string[];

export const auth = betterAuth({
  baseURL: resolvedBaseURL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET || "test-secret-should-be-at-least-32-chars-long-xxxxx",
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  // Relax origin/CSRF for local API use (curl / server-to-server).
  // Consider tightening in production by setting trustedOrigins instead.
  advanced: {
    disableCSRFCheck: true,
    disableOriginCheck: true,
    useSecureCookies: process.env.NODE_ENV === "production"
  },
  trustedOrigins
});

console.log(`[BETTER-AUTH] Initialized successfully with baseURL=${resolvedBaseURL}`);
