import { prisma } from "../prisma";
import { createAuditLog, AuditAction } from "./audit";

export type ReviewStatus = "pending" | "approved" | "rejected" | "auto_approved";
export type ReviewAction = "approve" | "reject" | "request_changes";

export interface MakerCheckerConfig {
  enabled: boolean;
  autoApproveThreshold?: number; // Auto-approve transactions below this amount
  requireDualApproval?: boolean; // Require two different approvers
  allowSelfApproval?: boolean; // Allow maker to approve their own work
  expirationHours?: number; // Hours before pending review expires
}

export interface ReviewRequest {
  transactionId: string;
  action: ReviewAction;
  comment?: string;
  reviewerId: string;
}

export interface ReviewResult {
  success: boolean;
  status: ReviewStatus;
  message: string;
  reviewId?: string;
}

/**
 * Check if a transaction requires review based on config
 */
export async function requiresReview(
  transaction: {
    amount: number;
    confidenceScore?: number;
    hasAnomalies?: boolean;
  },
  config: MakerCheckerConfig
): Promise<{ required: boolean; reason?: string }> {
  if (!config.enabled) {
    return { required: false };
  }

  // Auto-approve small transactions
  if (config.autoApproveThreshold && Math.abs(transaction.amount) < config.autoApproveThreshold) {
    return { required: false };
  }

  // Require review for low confidence
  if (transaction.confidenceScore !== undefined && transaction.confidenceScore < 70) {
    return { required: true, reason: "Low confidence score" };
  }

  // Require review for anomalies
  if (transaction.hasAnomalies) {
    return { required: true, reason: "Anomalies detected" };
  }

  // Default: require review for high-value transactions
  if (Math.abs(transaction.amount) >= 10000) {
    return { required: true, reason: "High-value transaction" };
  }

  return { required: false };
}

/**
 * Create a review request for a transaction
 */
export async function createReviewRequest(
  transactionId: string,
  makerId: string,
  organizationId: string,
  reason?: string
): Promise<{ reviewId: string }> {
  // Update transaction status
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      reviewStatus: "pending",
      reviewRequestedAt: new Date(),
      reviewRequestedBy: makerId
    }
  });

  // Create review record
  const review = await prisma.transactionReview.create({
    data: {
      transactionId,
      reviewerId: "", // Will be set when reviewed
      action: "pending",
      comment: reason || "Awaiting review"
    }
  });

  // Audit log
  await createAuditLog({
    userId: makerId,
    organizationId,
    action: "review_requested",
    entityType: "transaction",
    entityId: transactionId,
    metadata: { reason }
  });

  return { reviewId: review.id };
}

/**
 * Process a review decision
 */
export async function processReview(
  request: ReviewRequest,
  organizationId: string
): Promise<ReviewResult> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: request.transactionId },
    include: { reviews: true }
  });

  if (!transaction) {
    return { success: false, status: "pending", message: "Transaction not found" };
  }

  if (transaction.reviewStatus !== "pending") {
    return { 
      success: false, 
      status: transaction.reviewStatus as ReviewStatus, 
      message: "Transaction is not pending review" 
    };
  }

  // Check self-approval
  if (transaction.reviewRequestedBy === request.reviewerId) {
    // Could check config here, but for now just note it
    console.warn("Self-approval attempted");
  }

  // Create review record
  const review = await prisma.transactionReview.create({
    data: {
      transactionId: request.transactionId,
      reviewerId: request.reviewerId,
      action: request.action,
      comment: request.comment || ""
    }
  });

  let newStatus: ReviewStatus;
  let message: string;

  switch (request.action) {
    case "approve":
      newStatus = "approved";
      message = "Transaction approved successfully";
      break;
    case "reject":
      newStatus = "rejected";
      message = "Transaction rejected";
      break;
    case "request_changes":
      newStatus = "pending"; // Keep pending but with feedback
      message = "Changes requested";
      break;
    default:
      return { success: false, status: "pending", message: "Invalid action" };
  }

  // Update transaction
  await prisma.transaction.update({
    where: { id: request.transactionId },
    data: {
      reviewStatus: newStatus,
      reviewedAt: new Date(),
      reviewedBy: request.reviewerId
    }
  });

  // Audit log
  await createAuditLog({
    userId: request.reviewerId,
    organizationId,
    action: `transaction_${request.action}` as AuditAction,
    entityType: "transaction",
    entityId: request.transactionId,
    metadata: { 
      comment: request.comment,
      previousStatus: "pending"
    }
  });

  return {
    success: true,
    status: newStatus,
    message,
    reviewId: review.id
  };
}

/**
 * Get pending reviews for a reviewer
 */
export async function getPendingReviews(
  organizationId: string,
  reviewerId?: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<{
  reviews: Array<{
    id: string;
    transactionId: string;
    transaction: {
      id: string;
      amount: number;
      description: string;
      date: Date;
      category: string | null;
      counterparty: string | null;
    };
    requestedAt: Date;
    requestedBy: { name: string; email: string };
    status: "PENDING" | "APPROVED" | "REJECTED";
  }>;
  total: number;
}> {
  const where = {
    organizationId,
    reviewStatus: "pending",
    ...(reviewerId && { reviewRequestedBy: { not: reviewerId } }) // Exclude self-reviews
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { reviewRequestedAt: "asc" },
      take: options?.limit || 20,
      skip: options?.offset || 0,
      include: {
        user: {
          select: { name: true, email: true }
        },
        reviews: {
          take: 1,
          orderBy: { createdAt: "desc" }
        }
      }
    }),
    prisma.transaction.count({ where })
  ]);

  return {
    reviews: transactions.map(tx => ({
      id: tx.reviews[0]?.id || tx.id, // Use review id if exists, otherwise use transaction id
      transactionId: tx.id,
      transaction: {
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        date: tx.date,
        category: tx.category,
        counterparty: tx.counterparty
      },
      requestedAt: tx.reviewRequestedAt || tx.createdAt,
      requestedBy: { 
        name: tx.user?.name || "Unknown User", 
        email: tx.user?.email || "unknown@example.com" 
      },
      status: "PENDING" as const
    })),
    total
  };
}

/**
 * Get review history for a transaction
 */
export async function getTransactionReviewHistory(
  transactionId: string
): Promise<Array<{
  id: string;
  reviewerId: string;
  action: string;
  comment: string;
  createdAt: Date;
}>> {
  const reviews = await prisma.transactionReview.findMany({
    where: { transactionId },
    orderBy: { createdAt: "desc" }
  });

  return reviews.map(r => ({
    id: r.id,
    reviewerId: r.reviewerId,
    action: r.action,
    comment: r.comment,
    createdAt: r.createdAt
  }));
}

/**
 * Auto-approve transactions that meet criteria
 */
export async function autoApproveTransactions(
  organizationId: string,
  config: MakerCheckerConfig
): Promise<{ autoApproved: number; skipped: number }> {
  if (!config.enabled || !config.autoApproveThreshold) {
    return { autoApproved: 0, skipped: 0 };
  }

  const pendingTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      reviewStatus: "pending",
      amount: {
        gte: -config.autoApproveThreshold,
        lte: config.autoApproveThreshold
      },
      overallConfidence: { gte: 80 }, // Only auto-approve high confidence
      isAnomaly: false
    }
  });

  let autoApproved = 0;
  let skipped = 0;

  for (const tx of pendingTransactions) {
    try {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          reviewStatus: "auto_approved",
          reviewedAt: new Date(),
          reviewedBy: "system"
        }
      });

      await createAuditLog({
        userId: "system",
        organizationId,
        action: "transaction_auto_approved",
        entityType: "transaction",
        entityId: tx.id,
        metadata: { 
          amount: tx.amount,
          confidence: tx.overallConfidence,
          threshold: config.autoApproveThreshold
        }
      });

      autoApproved++;
    } catch {
      skipped++;
    }
  }

  return { autoApproved, skipped };
}

/**
 * Escalate a transaction for senior review
 */
export async function escalateForReview(
  transactionId: string,
  escalatedBy: string,
  organizationId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId }
  });

  if (!transaction) {
    return { success: false, message: "Transaction not found" };
  }

  // Create escalation review
  await prisma.transactionReview.create({
    data: {
      transactionId,
      reviewerId: escalatedBy,
      action: "escalated",
      comment: `Escalated: ${reason}`
    }
  });

  // Update transaction
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      reviewStatus: "pending",
      reviewRequestedAt: new Date(),
      reviewRequestedBy: escalatedBy
    }
  });

  // Audit log
  await createAuditLog({
    userId: escalatedBy,
    organizationId,
    action: "transaction_escalated",
    entityType: "transaction",
    entityId: transactionId,
    metadata: { reason }
  });

  return { success: true, message: "Transaction escalated for senior review" };
}

/**
 * Get review statistics for an organization
 */
export async function getReviewStats(
  organizationId: string,
  dateFrom?: Date
): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  autoApproved: number;
  averageReviewTime: number; // in hours
}> {
  const where = {
    organizationId,
    ...(dateFrom && { createdAt: { gte: dateFrom } })
  };

  const [pending, approved, rejected, autoApproved, reviewedTransactions] = await Promise.all([
    prisma.transaction.count({ where: { ...where, reviewStatus: "pending" } }),
    prisma.transaction.count({ where: { ...where, reviewStatus: "approved" } }),
    prisma.transaction.count({ where: { ...where, reviewStatus: "rejected" } }),
    prisma.transaction.count({ where: { ...where, reviewStatus: "auto_approved" } }),
    prisma.transaction.findMany({
      where: { 
        ...where, 
        reviewStatus: { in: ["approved", "rejected"] },
        reviewRequestedAt: { not: null },
        reviewedAt: { not: null }
      },
      select: {
        reviewRequestedAt: true,
        reviewedAt: true
      }
    })
  ]);

  // Calculate average review time
  let totalReviewTime = 0;
  for (const tx of reviewedTransactions) {
    if (tx.reviewRequestedAt && tx.reviewedAt) {
      totalReviewTime += tx.reviewedAt.getTime() - tx.reviewRequestedAt.getTime();
    }
  }
  const averageReviewTime = reviewedTransactions.length > 0
    ? (totalReviewTime / reviewedTransactions.length) / (1000 * 60 * 60) // Convert to hours
    : 0;

  return {
    pending,
    approved,
    rejected,
    autoApproved,
    averageReviewTime: Math.round(averageReviewTime * 10) / 10
  };
}
