import { Hono } from "hono";
import type { Env } from "../types/env";
import { auth } from "../auth/better-auth";

export const authRoutes = new Hono<Env>();

// Better Auth handler - handles all /api/auth/* routes
authRoutes.on(["POST", "GET"], "/*", async (c) => {
  return auth.handler(c.req.raw);
});
