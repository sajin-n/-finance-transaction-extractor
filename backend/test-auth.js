// Quick test of Better Auth directly
import { betterAuth } from "better-auth";

const auth = betterAuth({
  secret: "test-secret-min-32-characters-long-xxxx",
  database: {
    provider: "sqlite",
    url: ":memory:"
  },
  emailAndPassword: {
    enabled: true
  }
});

// Start a simple server
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.all("*", (c) => auth.handler(c.req.raw));

serve({ fetch: app.fetch, port: 3002 });
console.log("Test auth server on http://localhost:3002");
