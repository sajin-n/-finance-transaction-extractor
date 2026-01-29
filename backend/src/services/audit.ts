import { prisma } from "../prisma";

export type AuditAction = 
  | "create" 
  | "update" 
  | "delete" 
  | "view" 
  | "export" 
  | "login" 
  | "logout"
  | "review"
  | "approve"
  | "reject"
  | "bulk_upload"
  | "bulk_process"
  | "bulk_job_created"
  | "bulk_job_cancelled"
  | "bulk_job_retry_created"
  | "review_requested"
  | "transaction_approve"
  | "transaction_reject"
  | "transaction_request_changes"
  | "transaction_escalated"
  | "transaction_auto_approved";

export type EntityType = 
  | "transaction" 
  | "user" 
  | "bulk_job" 
  | "organization"
  | "review"
  | "session";

export interface AuditLogParams {
  organizationId: string;
  userId?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry
 * This is the core function for compliance tracking
 */
export async function createAuditLog(params: AuditLogParams) {
  try {
    const log = await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues || undefined,
        newValues: params.newValues || undefined,
        metadata: params.metadata || undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      }
    });
    
    console.log(`[AUDIT] ${params.action} on ${params.entityType}${params.entityId ? `:${params.entityId}` : ""} by user ${params.userId || "system"}`);
    return log;
  } catch (error) {
    console.error("[AUDIT] Failed to create audit log:", error);
    // Don't throw - audit logging should not break the main flow
    return null;
  }
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(params: {
  organizationId: string;
  userId?: string;
  action?: AuditAction;
  entityType?: EntityType;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  cursor?: string;
}) {
  const where: any = { organizationId: params.organizationId };
  
  if (params.userId) where.userId = params.userId;
  if (params.action) where.action = params.action;
  if (params.entityType) where.entityType = params.entityType;
  if (params.entityId) where.entityId = params.entityId;
  
  if (params.startDate || params.endDate) {
    where.createdAt = {};
    if (params.startDate) where.createdAt.gte = params.startDate;
    if (params.endDate) where.createdAt.lte = params.endDate;
  }
  
  const logs = await prisma.auditLog.findMany({
    where,
    take: params.limit || 50,
    ...(params.cursor && {
      skip: 1,
      cursor: { id: params.cursor }
    }),
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, email: true, name: true }
      }
    }
  });
  
  return {
    data: logs,
    nextCursor: logs.length === (params.limit || 50) ? logs[logs.length - 1].id : null
  };
}

/**
 * Generate compliance report
 */
export async function generateComplianceReport(params: {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}) {
  const [
    totalActions,
    actionsByType,
    actionsByUser,
    dataExports,
    sensitiveActions
  ] = await Promise.all([
    // Total actions in period
    prisma.auditLog.count({
      where: {
        organizationId: params.organizationId,
        createdAt: { gte: params.startDate, lte: params.endDate }
      }
    }),
    
    // Actions grouped by type
    prisma.auditLog.groupBy({
      by: ["action"],
      where: {
        organizationId: params.organizationId,
        createdAt: { gte: params.startDate, lte: params.endDate }
      },
      _count: true
    }),
    
    // Actions by user
    prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        organizationId: params.organizationId,
        createdAt: { gte: params.startDate, lte: params.endDate }
      },
      _count: true
    }),
    
    // Data exports
    prisma.auditLog.findMany({
      where: {
        organizationId: params.organizationId,
        action: "export",
        createdAt: { gte: params.startDate, lte: params.endDate }
      },
      include: { user: { select: { email: true } } }
    }),
    
    // Sensitive actions (deletes, bulk operations)
    prisma.auditLog.findMany({
      where: {
        organizationId: params.organizationId,
        action: { in: ["delete", "bulk_process", "bulk_upload"] },
        createdAt: { gte: params.startDate, lte: params.endDate }
      },
      include: { user: { select: { email: true } } }
    })
  ]);
  
  return {
    period: { start: params.startDate, end: params.endDate },
    summary: {
      totalActions,
      actionBreakdown: actionsByType,
      userActivity: actionsByUser
    },
    compliance: {
      dataExports: dataExports.length,
      dataExportDetails: dataExports,
      sensitiveActions: sensitiveActions.length,
      sensitiveActionDetails: sensitiveActions
    }
  };
}
