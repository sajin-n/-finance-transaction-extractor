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

  // 3. Auto-categorize based on description
  const category = categorizeTransaction(parsed.description);

  // 4. Persist transaction scoped to organization AND user
  const tx = await prisma.transaction.create({
    data: {
      ...parsed,
      confidence,
      category,
      rawText: body.text,
      organizationId,
      userId
    }
  });

  return c.json(tx, 201);
});

/**
 * GET /api/transactions
 * Protected – cursor-based pagination with search and filters
 */
txRoutes.get("/", requireAuth, async (c) => {
  const { organizationId } = c.get("auth");
  const cursor = c.req.query("cursor");
  const search = c.req.query("search");
  const category = c.req.query("category");
  const status = c.req.query("status");
  const minAmount = c.req.query("minAmount");
  const maxAmount = c.req.query("maxAmount");
  const sortBy = c.req.query("sortBy") || "createdAt";
  const sortOrder = c.req.query("sortOrder") || "desc";

  // Build where clause
  const where: any = { organizationId };
  
  if (search) {
    where.description = {
      contains: search,
      mode: "insensitive"
    };
  }

  if (category && category !== "all") {
    where.category = category;
  }

  if (status && status !== "all") {
    where.status = status;
  }

  if (minAmount || maxAmount) {
    where.amount = {};
    if (minAmount) where.amount.gte = parseFloat(minAmount);
    if (maxAmount) where.amount.lte = parseFloat(maxAmount);
  }

  const transactions = await prisma.transaction.findMany({
    where,
    take: 10,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor }
    }),
    orderBy: { [sortBy]: sortOrder }
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

/**
 * GET /api/transactions/stats
 * Protected – get analytics/statistics
 */
txRoutes.get("/stats", requireAuth, async (c) => {
  const { organizationId } = c.get("auth");

  const [total, income, expenses, byCategory, byStatus] = await Promise.all([
    // Total count
    prisma.transaction.count({ where: { organizationId } }),
    
    // Total income
    prisma.transaction.aggregate({
      where: { organizationId, amount: { gt: 0 } },
      _sum: { amount: true },
      _count: true
    }),
    
    // Total expenses
    prisma.transaction.aggregate({
      where: { organizationId, amount: { lt: 0 } },
      _sum: { amount: true },
      _count: true
    }),
    
    // By category
    prisma.transaction.groupBy({
      by: ["category"],
      where: { organizationId },
      _sum: { amount: true },
      _count: true
    }),
    
    // By status
    prisma.transaction.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: true
    })
  ]);

  return c.json({
    total,
    income: {
      total: income._sum.amount || 0,
      count: income._count
    },
    expenses: {
      total: Math.abs(expenses._sum.amount || 0),
      count: expenses._count
    },
    byCategory,
    byStatus
  });
});

/**
 * GET /api/transactions/export
 * Protected – export transactions as CSV
 */
txRoutes.get("/export", requireAuth, async (c) => {
  const { organizationId } = c.get("auth");

  const transactions = await prisma.transaction.findMany({
    where: { organizationId },
    orderBy: { date: "desc" }
  });

  // Generate CSV
  const headers = ["Date", "Description", "Amount", "Balance", "Category", "Status", "Confidence", "Notes"];
  const rows = transactions.map(t => [
    new Date(t.date).toLocaleDateString(),
    `"${t.description.replace(/"/g, '""')}"`,
    t.amount,
    t.balance || "",
    t.category || "",
    t.status,
    t.confidence,
    t.notes ? `"${t.notes.replace(/"/g, '""')}"` : ""
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="transactions-${new Date().toISOString().split('T')[0]}.csv"`);
  
  return c.body(csv);
});

/**
 * PATCH /api/transactions/:id
 * Protected – update a transaction
 */
txRoutes.patch("/:id", requireAuth, async (c) => {
  const { organizationId, userId } = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  if (!body) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  // Verify ownership
  const existing = await prisma.transaction.findFirst({
    where: { id, organizationId }
  });

  if (!existing) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  // Update allowed fields only
  const allowedFields = ["description", "amount", "date", "category", "status", "notes", "tags"];
  const updates: any = {};
  
  for (const field of allowedFields) {
    if (field in body) {
      if (field === "date" && body[field]) {
        updates[field] = new Date(body[field]);
      } else {
        updates[field] = body[field];
      }
    }
  }

  updates.updatedAt = new Date();

  const updated = await prisma.transaction.update({
    where: { id },
    data: updates
  });

  return c.json(updated);
});

/**
 * DELETE /api/transactions/:id
 * Protected – delete a single transaction
 */
txRoutes.delete("/:id", requireAuth, async (c) => {
  const { organizationId } = c.get("auth");
  const id = c.req.param("id");

  // Verify ownership
  const existing = await prisma.transaction.findFirst({
    where: { id, organizationId }
  });

  if (!existing) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  await prisma.transaction.delete({
    where: { id }
  });

  return c.json({ success: true, message: "Transaction deleted" });
});

/**
 * POST /api/transactions/bulk-delete
 * Protected – delete multiple transactions
 */
txRoutes.post("/bulk-delete", requireAuth, async (c) => {
  const { organizationId } = c.get("auth");
  const body = await c.req.json().catch(() => null);

  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: "Field 'ids' must be a non-empty array" }, 400);
  }

  const result = await prisma.transaction.deleteMany({
    where: {
      id: { in: body.ids },
      organizationId
    }
  });

  return c.json({ 
    success: true, 
    deleted: result.count,
    message: `Deleted ${result.count} transaction(s)` 
  });
});

/**
 * Helper function to auto-categorize transactions
 */
function categorizeTransaction(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes("salary") || desc.includes("payroll") || desc.includes("wage")) {
    return "Income";
  }
  if (desc.includes("grocery") || desc.includes("supermarket") || desc.includes("food")) {
    return "Groceries";
  }
  if (desc.includes("restaurant") || desc.includes("cafe") || desc.includes("dining")) {
    return "Dining";
  }
  if (desc.includes("gas") || desc.includes("fuel") || desc.includes("petrol")) {
    return "Transportation";
  }
  if (desc.includes("electric") || desc.includes("water") || desc.includes("utility") || desc.includes("internet")) {
    return "Utilities";
  }
  if (desc.includes("rent") || desc.includes("mortgage") || desc.includes("lease")) {
    return "Housing";
  }
  if (desc.includes("amazon") || desc.includes("shopping") || desc.includes("retail")) {
    return "Shopping";
  }
  if (desc.includes("netflix") || desc.includes("spotify") || desc.includes("entertainment")) {
    return "Entertainment";
  }
  if (desc.includes("hospital") || desc.includes("pharmacy") || desc.includes("medical") || desc.includes("doctor")) {
    return "Healthcare";
  }
  if (desc.includes("transfer") || desc.includes("payment")) {
    return "Transfer";
  }
  
  return "Uncategorized";
}
