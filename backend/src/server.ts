import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { validateGroqConfiguration } from "./services/ai-extractor";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = "0.0.0.0"; // Required for Render and other cloud platforms
const DATABASE_URL = process.env.DATABASE_URL || "";

// Log environment
console.log("[SERVER] BETTER_AUTH_SECRET set:", !!process.env.BETTER_AUTH_SECRET);
console.log("[SERVER] BETTER_AUTH_SECRET length:", process.env.BETTER_AUTH_SECRET?.length || 0);

if (process.env.NODE_ENV === "production") {
  if (!DATABASE_URL) {
    console.error("[SERVER] ❌ DATABASE_URL is not set in production environment.");
    process.exit(1);
  }

  const normalizedDbUrl = DATABASE_URL.toLowerCase();
  if (normalizedDbUrl.includes("localhost") || normalizedDbUrl.includes("127.0.0.1")) {
    console.error("[SERVER] ❌ DATABASE_URL points to localhost in production. Configure managed Postgres URL in Render env vars.");
    process.exit(1);
  }
}

// Non-blocking AI config validation
void validateGroqConfiguration();

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST
}, (info) => {
  console.log(`Server is running on http://${HOST}:${info.port}`);
  console.log(`Health check: http://${HOST}:${info.port}/health`);
  console.log(`Auth endpoints: http://${HOST}:${info.port}/api/auth/*`);
});
