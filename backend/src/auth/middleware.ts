import type { MiddlewareHandler } from "hono";
import type { Env } from "../types/env";
import { auth } from "./better-auth";
import { prisma } from "../prisma";
import * as jwt from "jsonwebtoken";

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  console.log("[AUTH] requireAuth start", c.req.method, c.req.path);
  let userId: string | null = null;

  // 1. Try Better Auth session (from cookies)
  try {
    const sessionResult = await auth.api.getSession({
      headers: c.req.raw.headers
    });

    if (sessionResult?.user) {
      userId = sessionResult.user.id;
      console.log("[AUTH] Better Auth session found:", userId);
    }
  } catch (error) {
    console.log("[AUTH] Better Auth session not found");
  }

  // 2. If no Better Auth session, try Bearer token (Better Auth session token or JWT)
  if (!userId) {
    const authHeader = c.req.header("Authorization");
    console.log("[AUTH] Checking Authorization header:", authHeader ? "present" : "missing");
    
    if (authHeader) {
      console.log("[AUTH] Authorization header value (first 50 chars):", authHeader.substring(0, 50) + "...");
    }
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      console.log("[AUTH] Bearer token received (length):", token.length);
      console.log("[AUTH] Bearer token preview:", token.substring(0, 50) + "...");
      
      // Try to validate as Better Auth session token
      try {
        console.log("[AUTH] Attempting Better Auth session validation...");
        const sessionResult = await auth.api.getSession({
          headers: new Headers({
            "cookie": `better-auth.session_token=${token}`
          })
        });

        if (sessionResult?.user) {
          userId = sessionResult.user.id;
          console.log("[AUTH] Better Auth session validated from Bearer token:", userId);
        } else {
          console.log("[AUTH] Better Auth getSession returned but no user, treating as JWT token");
          throw new Error("Better Auth session not found, trying JWT");
        }
      } catch (sessionError) {
        console.log("[AUTH] Better Auth session validation failed:", sessionError instanceof Error ? sessionError.message : "Unknown error");
        console.log("[AUTH] Trying JWT validation...");
        
        // Fall back to JWT validation
        try {
          const secret = process.env.BETTER_AUTH_SECRET || "test-secret-should-be-at-least-32-chars-long-xxxxx";
          if (!process.env.BETTER_AUTH_SECRET) {
            console.warn("[AUTH] ⚠ BETTER_AUTH_SECRET not set, using fallback secret");
          }
          console.log("[AUTH] JWT validation - using secret (length):", secret.length);
          console.log("[AUTH] Attempting jwt.verify...");
          const decoded = jwt.verify(token, secret) as Record<string, any>;
          console.log("[AUTH] JWT decoded successfully, keys:", Object.keys(decoded));
          
          if (decoded?.sub) {
            userId = decoded.sub;
            console.log("[AUTH] ✓ JWT Bearer token validated successfully, userId:", userId);
          } else {
            console.log("[AUTH] ✗ JWT decoded but no sub field:", Object.keys(decoded));
          }
        } catch (jwtError) {
          console.error("[AUTH] ✗ JWT validation failed:", jwtError instanceof Error ? jwtError.message : String(jwtError));
          console.error("[AUTH] JWT error details:", jwtError);
        }
      }
    } else {
      console.log("[AUTH] Authorization header does not start with 'Bearer '");
    }
  }

  if (!userId) {
    console.error("[AUTH] ✗ Auth failed - No valid session or token found");
    return c.json({ error: "Unauthorized" }, 401);
  }

  // 3. Fetch user from DB to get organizationId (or create user if doesn't exist)
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, email: true }
  });

  // 4. If user doesn't exist in our User table, create them with a default org
  if (!user) {
    const org = await prisma.organization.create({
      data: {
        name: `${userId}'s Organization`
      }
    });

    user = await prisma.user.create({
      data: {
        id: userId,
        email: "",
        organizationId: org.id
      },
      select: { organizationId: true, email: true }
    });
  }

  // 5. If user exists but has no organization, create one and attach
  if (!user.organizationId) {
    const org = await prisma.organization.create({
      data: {
        name: `${user.email || userId}'s Organization`
      }
    });

    user = await prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
      select: { organizationId: true, email: true }
    });
  }

  console.log("[AUTH] User authorized:", userId, "org:", user.organizationId);

  // 6. Inject typed auth context
  c.set("auth", {
    userId,
    organizationId: user.organizationId!
  });

  await next();
};

