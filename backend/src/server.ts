import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = "0.0.0.0"; // Required for Render and other cloud platforms

// Log environment
console.log("[SERVER] BETTER_AUTH_SECRET set:", !!process.env.BETTER_AUTH_SECRET);
console.log("[SERVER] BETTER_AUTH_SECRET length:", process.env.BETTER_AUTH_SECRET?.length || 0);

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST
}, (info) => {
  console.log(`Server is running on http://${HOST}:${info.port}`);
  console.log(`Health check: http://${HOST}:${info.port}/health`);
  console.log(`Auth endpoints: http://${HOST}:${info.port}/api/auth/*`);
});
