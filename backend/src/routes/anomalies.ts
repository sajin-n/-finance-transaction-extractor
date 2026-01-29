import { Hono } from "hono";
import type { Env } from "../types/env";
import { detectAnomalies, detectAnomaliesBatch, getAnomalyStats, runFullAnomalyScan } from "../services/anomaly";
import { requireAuth } from "../auth/middleware";
import { prisma } from "../prisma";

const anomalyRoutes = new Hono<Env>();

/**
 * POST /api/anomalies/detect - Detect anomalies in a single transaction
 */
anomalyRoutes.post("/detect", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const body = await c.req.json();
    const { amount, description, category, date } = body;

    if (amount === undefined || !description) {
      return c.json({ error: "Amount and description are required" }, 400);
    }

    const result = await detectAnomalies(
      {
        amount,
        description,
        category,
        date: date ? new Date(date) : new Date()
      },
      organizationId || userId
    );

    return c.json(result);
  } catch (error) {
    console.error("Error detecting anomalies:", error);
    return c.json({ error: "Failed to detect anomalies" }, 500);
  }
});

/**
 * POST /api/anomalies/detect-batch - Detect anomalies in multiple transactions
 * This now UPDATES the database with anomaly findings
 */
anomalyRoutes.post("/detect-batch", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const body = await c.req.json();
    const { transactions } = body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return c.json({ error: "Transactions array is required" }, 400);
    }

    const results = await detectAnomaliesBatch(
      transactions.map((t: { id?: string; amount: number; description: string; category?: string; date?: string }) => ({
        id: t.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: t.amount,
        description: t.description,
        category: t.category,
        date: t.date ? new Date(t.date) : new Date()
      })),
      organizationId || userId
    );

    // Convert Map to array for JSON response
    const resultsArray = Array.from(results.entries()).map(([id, result]) => ({
      id,
      ...result
    }));

    return c.json({ 
      success: true,
      results: resultsArray,
      anomaliesFound: resultsArray.filter(r => r.isAnomaly).length
    });
  } catch (error) {
    console.error("Error detecting anomalies in batch:", error);
    return c.json({ error: "Failed to detect anomalies" }, 500);
  }
});

/**
 * POST /api/anomalies/scan - Run full anomaly scan on all transactions
 */
anomalyRoutes.post("/scan", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const result = await runFullAnomalyScan(organizationId || userId);

    return c.json({
      success: true,
      ...result,
      message: `Scanned ${result.scanned} transactions, found ${result.anomaliesFound} anomalies`
    });
  } catch (error) {
    console.error("Error running full anomaly scan:", error);
    return c.json({ error: "Failed to run anomaly scan" }, 500);
  }
});

/**
 * GET /api/anomalies/stats - Get anomaly statistics
 */
anomalyRoutes.get("/stats", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const stats = await getAnomalyStats(organizationId || userId);

    return c.json(stats);
  } catch (error) {
    console.error("Error fetching anomaly stats:", error);
    return c.json({ error: "Failed to fetch anomaly statistics" }, 500);
  }
});

/**
 * GET /api/anomalies/list - Get all transactions flagged as anomalies
 */
anomalyRoutes.get("/list", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const anomalies = await prisma.transaction.findMany({
      where: {
        organizationId: organizationId || userId,
        isAnomaly: true
      },
      orderBy: { anomalyScore: "desc" },
      take: 50
    });

    return c.json({ 
      data: anomalies,
      count: anomalies.length 
    });
  } catch (error) {
    console.error("Error fetching anomalies:", error);
    return c.json({ error: "Failed to fetch anomalies" }, 500);
  }
});

export { anomalyRoutes };
