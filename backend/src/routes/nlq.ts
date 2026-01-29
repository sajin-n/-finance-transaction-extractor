import { Hono } from "hono";
import type { Env } from "../types/env";
import { executeNaturalLanguageQuery, getQuerySuggestions } from "../services/nlq";
import { requireAuth } from "../auth/middleware";

const nlqRoutes = new Hono<Env>();

/**
 * POST /api/nlq/query - Execute a natural language query
 */
nlqRoutes.post("/query", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const body = await c.req.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return c.json({ error: "Query string is required" }, 400);
    }

    if (query.length > 500) {
      return c.json({ error: "Query too long (max 500 characters)" }, 400);
    }

    const result = await executeNaturalLanguageQuery(
      query,
      organizationId || userId
    );

    return c.json(result);
  } catch (error) {
    console.error("Error executing NLQ:", error);
    return c.json({ error: "Failed to execute query" }, 500);
  }
});

/**
 * GET /api/nlq/suggestions - Get query suggestions
 */
nlqRoutes.get("/suggestions", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const suggestions = await getQuerySuggestions(
      organizationId || userId
    );

    return c.json({ suggestions });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return c.json({ error: "Failed to fetch suggestions" }, 500);
  }
});

export { nlqRoutes };
