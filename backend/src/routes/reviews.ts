import { Hono } from "hono";
import type { Env } from "../types/env";
import { 
  getPendingReviews,
  processReview,
  getTransactionReviewHistory,
  getReviewStats,
  escalateForReview
} from "../services/maker-checker";
import { requireAuth } from "../auth/middleware";

const reviewRoutes = new Hono<Env>();

/**
 * GET /api/reviews/pending - Get pending reviews
 */
reviewRoutes.get("/pending", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const url = new URL(c.req.url);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const result = await getPendingReviews(
      organizationId || userId,
      userId,
      { limit, offset }
    );

    return c.json(result);
  } catch (error) {
    console.error("Error fetching pending reviews:", error);
    return c.json({ error: "Failed to fetch pending reviews" }, 500);
  }
});

/**
 * POST /api/reviews/:transactionId/approve - Approve a transaction
 */
reviewRoutes.post("/:transactionId/approve", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");
    const transactionId = c.req.param("transactionId");
    const body = await c.req.json().catch(() => ({}));
    const comment = body.comment || "";

    const result = await processReview(
      {
        transactionId,
        action: "approve",
        comment,
        reviewerId: userId
      },
      organizationId || userId
    );

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error approving transaction:", error);
    return c.json({ error: "Failed to approve transaction" }, 500);
  }
});

/**
 * POST /api/reviews/:transactionId/reject - Reject a transaction
 */
reviewRoutes.post("/:transactionId/reject", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");
    const transactionId = c.req.param("transactionId");
    const body = await c.req.json();
    const { comment } = body;

    if (!comment) {
      return c.json({ error: "Comment is required for rejection" }, 400);
    }

    const result = await processReview(
      {
        transactionId,
        action: "reject",
        comment,
        reviewerId: userId
      },
      organizationId || userId
    );

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error rejecting transaction:", error);
    return c.json({ error: "Failed to reject transaction" }, 500);
  }
});

/**
 * POST /api/reviews/:transactionId/escalate - Escalate for senior review
 */
reviewRoutes.post("/:transactionId/escalate", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");
    const transactionId = c.req.param("transactionId");
    const body = await c.req.json();
    const { reason } = body;

    if (!reason) {
      return c.json({ error: "Reason is required for escalation" }, 400);
    }

    const result = await escalateForReview(
      transactionId,
      userId,
      organizationId || userId,
      reason
    );

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error escalating transaction:", error);
    return c.json({ error: "Failed to escalate transaction" }, 500);
  }
});

/**
 * GET /api/reviews/:transactionId/history - Get review history
 */
reviewRoutes.get("/:transactionId/history", requireAuth, async (c) => {
  try {
    const transactionId = c.req.param("transactionId");
    const history = await getTransactionReviewHistory(transactionId);

    return c.json({ history });
  } catch (error) {
    console.error("Error fetching review history:", error);
    return c.json({ error: "Failed to fetch review history" }, 500);
  }
});

/**
 * GET /api/reviews/stats - Get review statistics
 */
reviewRoutes.get("/stats", requireAuth, async (c) => {
  try {
    const { userId, organizationId } = c.get("auth");

    const url = new URL(c.req.url);
    const startDate = url.searchParams.get("startDate");

    const stats = await getReviewStats(
      organizationId || userId,
      startDate ? new Date(startDate) : undefined
    );

    return c.json(stats);
  } catch (error) {
    console.error("Error fetching review stats:", error);
    return c.json({ error: "Failed to fetch review statistics" }, 500);
  }
});

export { reviewRoutes };
