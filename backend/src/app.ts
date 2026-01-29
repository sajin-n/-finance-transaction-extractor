import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth/better-auth";
import { txRoutes } from "./routes/transactions";
import { auditRoutes } from "./routes/audit";
import { anomalyRoutes } from "./routes/anomalies";
import { bulkRoutes } from "./routes/bulk";
import { nlqRoutes } from "./routes/nlq";
import { reviewRoutes } from "./routes/reviews";
import { prisma } from "./prisma";
import { verifyPassword } from "better-auth/crypto";
import * as jwt from "jsonwebtoken";

export const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
  origin: ["http://localhost:3001", "http://localhost:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3000"],
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposeHeaders: ["Set-Cookie", "Content-Type"],
  maxAge: 86400
}));

// Health check
app.get("/health", (c) => c.text("OK"));

// Debug endpoint to check token
app.post("/api/auth/debug-token", async (c) => {
  const authHeader = c.req.header("Authorization");
  console.log("[DEBUG] Auth header present:", !!authHeader);
  
  if (!authHeader) {
    return c.json({ error: "No auth header" }, 400);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Invalid format" }, 400);
  }

  const token = authHeader.substring(7);
  const secret = process.env.BETTER_AUTH_SECRET || "test-secret-should-be-at-least-32-chars-long-xxxxx";
  if (!process.env.BETTER_AUTH_SECRET) {
    console.warn("[DEBUG] ⚠ BETTER_AUTH_SECRET not set, using fallback");
  }
  
  try {
    const decoded = jwt.verify(token, secret);
    return c.json({ success: true, decoded }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid token" }, 400);
  }
});

// Custom sign-in endpoint (for NextAuth server-to-server)
app.post("/api/auth/custom-sign-in", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Missing email or password" }, 400);
  }

  try {
    // Find user with password account
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: true
      }
    });

    if (!user) {
      console.log("[CUSTOM-SIGN-IN] User not found:", email);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    console.log("[CUSTOM-SIGN-IN] User found:", email, "Accounts:", user.accounts.map(a => ({ providerId: a.providerId, hasPassword: !!a.password })));

    // Find password account - Better Auth uses "credential" as providerId
    const passwordAccount = user.accounts.find(acc => acc.providerId === "credential" || acc.providerId === "email");
    if (!passwordAccount || !passwordAccount.password) {
      console.log("[CUSTOM-SIGN-IN] No password account found. Available providers:", user.accounts.map(a => a.providerId));
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Verify password
    const isPasswordValid = await verifyPassword({
      password,
      hash: passwordAccount.password
    });

    if (!isPasswordValid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Create JWT token with user ID as sub
    const secret = process.env.BETTER_AUTH_SECRET || "test-secret-should-be-at-least-32-chars-long-xxxxx";
    if (!process.env.BETTER_AUTH_SECRET) {
      console.warn("[CUSTOM-SIGN-IN] ⚠ BETTER_AUTH_SECRET not set, using fallback secret");
    }
    const jwtToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      secret,
      { expiresIn: "30d" }
    );
    
    console.log("[CUSTOM-SIGN-IN] User signed in:", user.email, "JWT created with expiration: 30d");


    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token: jwtToken
    }, 200);
  } catch (error) {
    console.error("[CUSTOM-SIGN-IN] Error:", error);
    return c.json({ error: "Sign in failed" }, 500);
  }
});

// Better Auth routes - handle all /api/auth/** paths
app.on(["GET", "POST", "PUT", "DELETE", "PATCH"], "/api/auth/*", async (c) => {
  console.log(`[AUTH] ${c.req.method} ${c.req.url}`);
  try {
    const response = await auth.handler(c.req.raw);
    console.log(`[AUTH] Response: ${response.status}`);
    return response;
  } catch (error) {
    console.error("[AUTH] Error:", error);
    return c.json({ error: "Auth error" }, 500);
  }
});

// Routes
app.route("/api/transactions", txRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/anomalies", anomalyRoutes);
app.route("/api/bulk", bulkRoutes);
app.route("/api/nlq", nlqRoutes);
app.route("/api/reviews", reviewRoutes);
