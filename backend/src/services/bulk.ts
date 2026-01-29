import { prisma } from "../prisma";
import { createAuditLog } from "./audit";

export type BulkJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface BulkJobProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  percentage: number;
}

export interface BulkJobResult {
  jobId: string;
  status: BulkJobStatus;
  progress: BulkJobProgress;
  results?: Array<{
    index: number;
    success: boolean;
    id?: string;
    error?: string;
  }>;
  webhookDelivered?: boolean;
  completedAt?: Date;
}

/**
 * Create a new bulk processing job
 */
export async function createBulkJob(
  userId: string,
  organizationId: string,
  jobType: string,
  totalItems: number,
  webhookUrl?: string
): Promise<{ jobId: string }> {
  const job = await prisma.bulkJob.create({
    data: {
      userId,
      organizationId,
      jobType,
      status: "pending",
      totalItems,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      webhookUrl,
      results: []
    }
  });

  await createAuditLog({
    userId,
    organizationId,
    action: "bulk_job_created",
    entityType: "bulk_job",
    entityId: job.id,
    metadata: { jobType, totalItems, hasWebhook: !!webhookUrl }
  });

  return { jobId: job.id };
}

/**
 * Process a bulk job (this would typically be called by a worker)
 */
export async function processBulkJob<T>(
  jobId: string,
  items: T[],
  processor: (item: T, index: number) => Promise<{ success: boolean; id?: string; error?: string }>
): Promise<BulkJobResult> {
  // Update job to processing
  await prisma.bulkJob.update({
    where: { id: jobId },
    data: { 
      status: "processing",
      startedAt: new Date()
    }
  });

  const results: BulkJobResult["results"] = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await processor(items[i], i);
      results.push({ index: i, ...result });
      
      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Update progress every 10 items or at the end
      if ((i + 1) % 10 === 0 || i === items.length - 1) {
        await prisma.bulkJob.update({
          where: { id: jobId },
          data: {
            processedItems: i + 1,
            successfulItems: successful,
            failedItems: failed
          }
        });
      }
    } catch (error) {
      failed++;
      results.push({
        index: i,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  // Complete the job
  const completedJob = await prisma.bulkJob.update({
    where: { id: jobId },
    data: {
      status: failed === items.length ? "failed" : "completed",
      processedItems: items.length,
      successfulItems: successful,
      failedItems: failed,
      completedAt: new Date(),
      results: results as unknown as string
    }
  });

  // Send webhook if configured
  let webhookDelivered = false;
  if (completedJob.webhookUrl) {
    webhookDelivered = await sendWebhook(completedJob.webhookUrl, {
      event: "bulk_job_completed",
      jobId,
      status: completedJob.status,
      progress: {
        total: items.length,
        processed: items.length,
        successful,
        failed,
        percentage: 100
      },
      completedAt: completedJob.completedAt
    });
  }

  return {
    jobId,
    status: completedJob.status as BulkJobStatus,
    progress: {
      total: items.length,
      processed: items.length,
      successful,
      failed,
      percentage: 100
    },
    results,
    webhookDelivered,
    completedAt: completedJob.completedAt || undefined
  };
}

/**
 * Get bulk job status
 */
export async function getBulkJobStatus(jobId: string): Promise<BulkJobResult | null> {
  const job = await prisma.bulkJob.findUnique({
    where: { id: jobId }
  });

  if (!job) return null;

  return {
    jobId: job.id,
    status: job.status as BulkJobStatus,
    progress: {
      total: job.totalItems,
      processed: job.processedItems,
      successful: job.successfulItems,
      failed: job.failedItems,
      percentage: job.totalItems > 0 
        ? Math.round((job.processedItems / job.totalItems) * 100) 
        : 0
    },
    results: job.results as BulkJobResult["results"],
    completedAt: job.completedAt || undefined
  };
}

/**
 * List bulk jobs for an organization
 */
export async function listBulkJobs(
  organizationId: string,
  options?: {
    status?: BulkJobStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{
  jobs: Array<{
    id: string;
    jobType: string;
    status: BulkJobStatus;
    progress: BulkJobProgress;
    createdAt: Date;
    completedAt: Date | null;
  }>;
  total: number;
}> {
  const where = {
    organizationId,
    ...(options?.status && { status: options.status })
  };

  const [jobs, total] = await Promise.all([
    prisma.bulkJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit || 20,
      skip: options?.offset || 0
    }),
    prisma.bulkJob.count({ where })
  ]);

  return {
    jobs: jobs.map(job => ({
      id: job.id,
      jobType: job.jobType,
      status: job.status as BulkJobStatus,
      progress: {
        total: job.totalItems,
        processed: job.processedItems,
        successful: job.successfulItems,
        failed: job.failedItems,
        percentage: job.totalItems > 0 
          ? Math.round((job.processedItems / job.totalItems) * 100) 
          : 0
      },
      createdAt: job.createdAt,
      completedAt: job.completedAt
    })),
    total
  };
}

/**
 * Cancel a pending or processing bulk job
 */
export async function cancelBulkJob(
  jobId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const job = await prisma.bulkJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return { success: false, error: `Cannot cancel job with status: ${job.status}` };
  }

  await prisma.bulkJob.update({
    where: { id: jobId },
    data: { 
      status: "cancelled",
      completedAt: new Date()
    }
  });

  await createAuditLog({
    userId,
    organizationId: job.organizationId,
    action: "bulk_job_cancelled",
    entityType: "bulk_job",
    entityId: jobId,
    metadata: { previousStatus: job.status }
  });

  // Send cancellation webhook if configured
  if (job.webhookUrl) {
    await sendWebhook(job.webhookUrl, {
      event: "bulk_job_cancelled",
      jobId,
      cancelledBy: userId,
      cancelledAt: new Date()
    });
  }

  return { success: true };
}

/**
 * Send webhook notification
 */
async function sendWebhook(
  url: string, 
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": payload.event as string,
        "X-Timestamp": new Date().toISOString()
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    return response.ok;
  } catch (error) {
    console.error("Webhook delivery failed:", error);
    return false;
  }
}

/**
 * Retry failed items in a bulk job
 */
export async function retryFailedItems(
  jobId: string,
  userId: string
): Promise<{ success: boolean; newJobId?: string; error?: string }> {
  const job = await prisma.bulkJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "completed" && job.status !== "failed") {
    return { success: false, error: "Can only retry completed or failed jobs" };
  }

  const results = job.results as unknown as BulkJobResult["results"];
  if (!results) {
    return { success: false, error: "No results found for this job" };
  }

  const failedItems = results.filter(r => !r.success);
  if (failedItems.length === 0) {
    return { success: false, error: "No failed items to retry" };
  }

  // Create a new job for retries
  const newJob = await prisma.bulkJob.create({
    data: {
      userId,
      organizationId: job.organizationId,
      jobType: `${job.jobType}_retry`,
      status: "pending",
      totalItems: failedItems.length,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      webhookUrl: job.webhookUrl,
      results: [],
      parentJobId: jobId
    }
  });

  await createAuditLog({
    userId,
    organizationId: job.organizationId,
    action: "bulk_job_retry_created",
    entityType: "bulk_job",
    entityId: newJob.id,
    metadata: { 
      parentJobId: jobId,
      failedItemCount: failedItems.length
    }
  });

  return { success: true, newJobId: newJob.id };
}
