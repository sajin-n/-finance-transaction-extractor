import { Hono } from "hono";
import type { Env } from "../types/env";
import { getAuditLogs, generateComplianceReport } from "../services/audit";
import { requireAuth } from "../auth/middleware";

const auditRoutes = new Hono<Env>();

/**
 * GET /api/audit/logs - Get audit logs
 */
auditRoutes.get("/logs", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const url = new URL(c.req.url);
    const entityType = url.searchParams.get("entityType") || undefined;
    const action = url.searchParams.get("action") || undefined;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const result = await getAuditLogs({
      organizationId: organizationId || userId,
      entityType: entityType as "transaction" | "user" | "bulk_job" | "organization" | "review" | "session" | undefined,
      action: action as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit
    });

    return c.json(result);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return c.json({ error: "Failed to fetch audit logs" }, 500);
  }
});

/**
 * GET /api/audit/compliance-report - Generate compliance report
 */
auditRoutes.get("/compliance-report", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const url = new URL(c.req.url);
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");

    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    const startDate = startDateParam 
      ? new Date(startDateParam) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

    const report = await generateComplianceReport({
      organizationId: organizationId || userId,
      startDate,
      endDate
    });

    return c.json(report);
  } catch (error) {
    console.error("Error generating compliance report:", error);
    return c.json({ error: "Failed to generate compliance report" }, 500);
  }
});

export { auditRoutes };
