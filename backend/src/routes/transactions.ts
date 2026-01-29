import { Hono } from "hono";
import type { Env } from "../types/env";
import { prisma } from "../prisma";
import { requireAuth } from "../auth/middleware";
import { extractTransaction } from "../services/extractor";
import { extractTransactionsWithAI, extractWithRegex } from "../services/ai-extractor";
import { parseFile } from "../services/file-parser";
import { calculateConfidence } from "../utils/confidence";
import { detectAnomaliesBatch } from "../services/anomaly";
import { createAuditLog } from "../services/audit";

export const txRoutes = new Hono<Env>();

/**
 * POST /api/transactions/upload
 * Protected – handles file upload (CSV, PDF, Excel, TXT)
 */
txRoutes.post("/upload", requireAuth, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    const { organizationId, userId } = c.get("auth");
    const fileName = file.name.toLowerCase();
    
    console.log(`[Upload] Processing file: ${file.name} (${file.size} bytes)`);

    // Use the new file parser for CSV, PDF, and text files
    let parsedTransactions;
    try {
      parsedTransactions = await parseFile(file);
      console.log(`[Upload] Parsed ${parsedTransactions.length} transactions from file`);
    } catch (parseError) {
      console.error("[Upload] File parsing failed:", parseError);
      return c.json({ 
        error: parseError instanceof Error ? parseError.message : "Failed to parse file",
        hint: "Supported formats: CSV, PDF, TXT. For Excel files, please convert to CSV first."
      }, 400);
    }

    if (parsedTransactions.length === 0) {
      return c.json({ 
        error: "No transactions found in file",
        hint: "Ensure the file contains transaction data with dates, descriptions, and amounts."
      }, 400);
    }

    const transactions = [];
    
    for (const parsed of parsedTransactions) {
      try {
        const tx = await prisma.transaction.create({
          data: {
            date: parsed.date,
            description: parsed.description,
            amount: parsed.amount,
            category: parsed.category || categorizeTransaction(parsed.description),
            counterparty: parsed.counterparty || null,
            confidence: parsed.confidence,
            overallConfidence: parsed.confidence,
            organizationId,
            userId,
            sourceFile: file.name,
            // Set proper initial status for maker-checker workflow
            status: "pending",
            reviewStatus: "pending",
            reviewRequestedAt: new Date(),
            reviewRequestedBy: userId
          }
        });
        
        transactions.push(tx);
        
        // Create audit log for each transaction
        await createAuditLog({
          userId,
          organizationId,
          action: "create",
          entityType: "transaction",
          entityId: tx.id,
          newValues: {
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            category: tx.category
          },
          metadata: { source: "file_upload", fileName: file.name }
        });
      } catch (err) {
        console.error("Failed to save transaction:", parsed, err);
        // Continue with next transaction
      }
    }

    // Run anomaly detection on uploaded transactions (async, don't wait)
    if (transactions.length > 0) {
      console.log(`[Upload] Running anomaly detection on ${transactions.length} transactions`);
      detectAnomaliesBatch(
        transactions.map(tx => ({
          id: tx.id,
          amount: tx.amount,
          description: tx.description,
          category: tx.category || undefined,
          date: tx.date
        })),
        organizationId
      ).then(results => {
        const anomalyCount = Array.from(results.values()).filter(r => r.isAnomaly).length;
        console.log(`[Upload] Anomaly detection complete: ${anomalyCount} anomalies found`);
      }).catch(err => {
        console.error("[Upload] Anomaly detection failed:", err);
      });
    }

    return c.json({ 
      success: true,
      count: transactions.length,
      transactions 
    }, 201);
    
  } catch (err) {
    console.error("Upload error:", err);
    return c.json({ error: "Failed to process file" }, 500);
  }
});

/**
 * POST /api/transactions/extract
 * Protected – parses raw text (single or multi-line) using AI and stores transactions
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
  const useAI = body.useAI !== false; // Default to using AI

  try {
    // 2. Extract transactions using AI or regex
    let extractedTransactions;
    if (useAI) {
      console.log("[Extract] Using AI extraction for multi-line text");
      extractedTransactions = await extractTransactionsWithAI(body.text);
    } else {
      console.log("[Extract] Using regex extraction");
      extractedTransactions = extractWithRegex(body.text);
    }

    if (extractedTransactions.length === 0) {
      return c.json({ 
        error: "No transactions could be extracted from the provided text",
        hint: "Make sure each line contains a date, description, and amount"
      }, 400);
    }

    // 3. Save all extracted transactions
    const savedTransactions = [];
    for (const parsed of extractedTransactions) {
      const tx = await prisma.transaction.create({
        data: {
          date: parsed.date,
          description: parsed.description,
          amount: parsed.amount,
          category: parsed.category || categorizeTransaction(parsed.description),
          counterparty: parsed.counterparty || null,
          confidence: parsed.confidence, // Required field
          overallConfidence: parsed.confidence, // Optional field
          rawText: body.text.substring(0, 500), // Store first 500 chars of raw input
          organizationId,
          userId,
          // Set proper initial status for maker-checker workflow
          status: "pending",
          reviewStatus: "pending",
          reviewRequestedAt: new Date(),
          reviewRequestedBy: userId
        }
      });
      savedTransactions.push(tx);
      
      // Create audit log for each transaction
      await createAuditLog({
        userId,
        organizationId,
        action: "create",
        entityType: "transaction",
        entityId: tx.id,
        newValues: {
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          category: tx.category
        },
        metadata: { source: "paste_extract", aiUsed: useAI }
      });
    }

    // 4. Run anomaly detection on new transactions (async, don't wait)
    if (savedTransactions.length > 0) {
      console.log(`[Extract] Running anomaly detection on ${savedTransactions.length} transactions`);
      detectAnomaliesBatch(
        savedTransactions.map(tx => ({
          id: tx.id,
          amount: tx.amount,
          description: tx.description,
          category: tx.category || undefined,
          date: tx.date
        })),
        organizationId
      ).then(results => {
        const anomalyCount = Array.from(results.values()).filter(r => r.isAnomaly).length;
        console.log(`[Extract] Anomaly detection complete: ${anomalyCount} anomalies found`);
      }).catch(err => {
        console.error("[Extract] Anomaly detection failed:", err);
      });
    }

    return c.json({
      success: true,
      count: savedTransactions.length,
      transactions: savedTransactions,
      aiUsed: useAI
    }, 201);

  } catch (error) {
    console.error("[Extract] Error:", error);
    return c.json({ error: "Failed to extract transactions" }, 500);
  }
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
 * DELETE /api/transactions/all
 * Protected – delete ALL transactions for the organization
 * NOTE: Must be defined BEFORE /:id route to avoid "all" being matched as an id
 */
txRoutes.delete("/all", requireAuth, async (c) => {
  const { organizationId, userId } = c.get("auth");

  const result = await prisma.transaction.deleteMany({
    where: { organizationId }
  });

  // Audit log for bulk delete
  await createAuditLog({
    userId,
    organizationId,
    action: "delete",
    entityType: "transaction",
    metadata: { 
      action: "delete_all",
      count: result.count
    }
  });

  return c.json({ 
    success: true, 
    deleted: result.count,
    message: `Deleted all ${result.count} transaction(s)` 
  });
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
  const { organizationId, userId } = c.get("auth");
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

  // Audit log for bulk delete
  await createAuditLog({
    userId,
    organizationId,
    action: "delete",
    entityType: "transaction",
    metadata: { 
      action: "bulk_delete",
      ids: body.ids,
      count: result.count 
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
