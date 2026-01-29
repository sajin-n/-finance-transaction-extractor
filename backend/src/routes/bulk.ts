import { Hono } from "hono";
import type { Env } from "../types/env";
import { 
  createBulkJob, 
  getBulkJobStatus, 
  listBulkJobs, 
  cancelBulkJob,
  retryFailedItems
} from "../services/bulk";
import { requireAuth } from "../auth/middleware";

const bulkRoutes = new Hono<Env>();

/**
 * POST /api/bulk/jobs - Create a new bulk job
 */
bulkRoutes.post("/jobs", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const body = await c.req.json();
    const { jobType, totalItems, webhookUrl } = body;

    if (!jobType || !totalItems) {
      return c.json({ error: "jobType and totalItems are required" }, 400);
    }

    const result = await createBulkJob(
      userId,
      organizationId || userId,
      jobType,
      totalItems,
      webhookUrl
    );

    return c.json(result, 201);
  } catch (error) {
    console.error("Error creating bulk job:", error);
    return c.json({ error: "Failed to create bulk job" }, 500);
  }
});

/**
 * GET /api/bulk/jobs - List bulk jobs
 */
bulkRoutes.get("/jobs", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const url = new URL(c.req.url);
    const status = url.searchParams.get("status") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const result = await listBulkJobs(
      organizationId || userId,
      {
        status: status as "pending" | "processing" | "completed" | "failed" | "cancelled" | undefined,
        limit,
        offset
      }
    );

    return c.json(result);
  } catch (error) {
    console.error("Error listing bulk jobs:", error);
    return c.json({ error: "Failed to list bulk jobs" }, 500);
  }
});

/**
 * GET /api/bulk/jobs/:id - Get bulk job status
 */
bulkRoutes.get("/jobs/:id", requireAuth, async (c) => {
  try {
    const jobId = c.req.param("id");
    const status = await getBulkJobStatus(jobId);

    if (!status) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json(status);
  } catch (error) {
    console.error("Error fetching bulk job status:", error);
    return c.json({ error: "Failed to fetch job status" }, 500);
  }
});

/**
 * POST /api/bulk/jobs/:id/cancel - Cancel a bulk job
 */
bulkRoutes.post("/jobs/:id/cancel", requireAuth, async (c) => {
  try {
    const { userId } = c.get("auth");
    const jobId = c.req.param("id");
    const result = await cancelBulkJob(jobId, userId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ message: "Job cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling bulk job:", error);
    return c.json({ error: "Failed to cancel job" }, 500);
  }
});

/**
 * POST /api/bulk/jobs/:id/retry - Retry failed items in a bulk job
 */
bulkRoutes.post("/jobs/:id/retry", requireAuth, async (c) => {
  try {
    const { userId } = c.get("auth");
    const jobId = c.req.param("id");
    const result = await retryFailedItems(jobId, userId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ 
      message: "Retry job created",
      newJobId: result.newJobId 
    }, 201);
  } catch (error) {
    console.error("Error retrying bulk job:", error);
    return c.json({ error: "Failed to retry job" }, 500);
  }
});

export { bulkRoutes };
