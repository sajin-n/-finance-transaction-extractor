import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Log environment
console.log("[SERVER] BETTER_AUTH_SECRET set:", !!process.env.BETTER_AUTH_SECRET);
console.log("[SERVER] BETTER_AUTH_SECRET length:", process.env.BETTER_AUTH_SECRET?.length || 0);

serve({
  fetch: app.fetch,
  port: PORT
});

console.log(`Backend running on http://localhost:${PORT}`);
console.log(`Health check: http://localhost:${PORT}/health`);
console.log(`Auth endpoints: http://localhost:${PORT}/api/auth/*`);
