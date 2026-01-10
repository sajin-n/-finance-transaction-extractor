import { Hono } from "hono";
import type { Env } from "../types/env";
import { prisma } from "../prisma";
import { requireAuth } from "../auth/middleware";
import { extractTransaction } from "../services/extractor";
import { calculateConfidence } from "../utils/confidence";

export const txRoutes = new Hono<Env>();

/**
 * POST /api/transactions/extract
 * Protected – parses raw text and stores transaction
 */
txRoutes.post("/extract", requireAuth, async (c) => {
  // 1. Safely parse body
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.text !== "string" || body.text.trim() === "") {
    return c.json(
      { error: "Field 'text' is required and must be a non-empty string" },
      400
    );
  }

  const { organizationId, userId } = c.get("auth");

  // 2. Extract transaction safely
  const parsed = extractTransaction(body.text);
  const confidence = calculateConfidence(body.text);

  // 3. Persist transaction scoped to organization AND user
  const tx = await prisma.transaction.create({
    data: {
      ...parsed,
      confidence,
      organizationId,
      userId
    }
  });

  return c.json(tx, 201);
});

/**
 * GET /api/transactions
 * Protected – cursor-based pagination
 */
txRoutes.get("/", requireAuth, async (c) => {
  const { organizationId } = c.get("auth");
  const cursor = c.req.query("cursor");

  const transactions = await prisma.transaction.findMany({
    where: { organizationId },
    take: 10,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor }
    }),
    orderBy: { createdAt: "desc" }
  });

  const nextCursor =
    transactions.length === 10
      ? transactions[transactions.length - 1].id
      : null;

  return c.json({
    data: transactions,
    nextCursor
  });
});
