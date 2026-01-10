console.log("Loading modules...");
import { serve } from "@hono/node-server";
import { app } from "./dist/app.js";

console.log("App loaded:", app);

try {
  console.log("Starting server on port 3001...");
  const server = serve({
    fetch: app.fetch,
    port: 3001
  });
  console.log("Server started successfully");
} catch (error) {
  console.error("Server error:", error);
  process.exit(1);
}
