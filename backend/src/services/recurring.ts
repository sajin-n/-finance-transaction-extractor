import { prisma } from "../prisma";

export interface RecurringPattern {
  isRecurring: boolean;
  pattern: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | null;
  confidence: number;
  groupId: string | null;
  projectedNextDate: Date | null;
  matchingTransactions: string[];
}

/**
 * Detect if a transaction is part of a recurring pattern
 */
export async function detectRecurringPayment(
  transaction: {
    amount: number;
    description: string;
    date: Date;
  },
  organizationId: string
): Promise<RecurringPattern> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Find similar transactions
  const similarTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      createdAt: { gte: sixMonthsAgo },
      // Amount within 5% tolerance
      amount: {
        gte: transaction.amount * 0.95,
        lte: transaction.amount * 1.05
      }
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      amount: true,
      description: true,
      date: true,
      recurringGroupId: true
    }
  });

  // Filter by description similarity
  const descWords = transaction.description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matchingTransactions = similarTransactions.filter(t => {
    const tWords = t.description.toLowerCase().split(/\s+/);
    const commonWords = descWords.filter(w => tWords.some(tw => tw.includes(w)));
    return commonWords.length >= Math.min(2, descWords.length);
  });

  if (matchingTransactions.length < 2) {
    return {
      isRecurring: false,
      pattern: null,
      confidence: 0,
      groupId: null,
      projectedNextDate: null,
      matchingTransactions: []
    };
  }

  // Calculate intervals between transactions
  const dates = matchingTransactions.map(t => new Date(t.date).getTime()).sort((a, b) => a - b);
  const intervals: number[] = [];
  
  for (let i = 1; i < dates.length; i++) {
    intervals.push(Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))); // Days
  }

  if (intervals.length === 0) {
    return {
      isRecurring: false,
      pattern: null,
      confidence: 0,
      groupId: null,
      projectedNextDate: null,
      matchingTransactions: []
    };
  }

  // Determine pattern based on average interval
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const stdDev = Math.sqrt(
    intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length
  );

  // Pattern detection with tolerance
  let pattern: RecurringPattern["pattern"] = null;
  let confidence = 0;

  if (avgInterval >= 5 && avgInterval <= 9 && stdDev < 3) {
    pattern = "weekly";
    confidence = Math.max(0, 100 - (stdDev * 10));
  } else if (avgInterval >= 12 && avgInterval <= 16 && stdDev < 4) {
    pattern = "biweekly";
    confidence = Math.max(0, 100 - (stdDev * 8));
  } else if (avgInterval >= 27 && avgInterval <= 33 && stdDev < 5) {
    pattern = "monthly";
    confidence = Math.max(0, 100 - (stdDev * 6));
  } else if (avgInterval >= 85 && avgInterval <= 100 && stdDev < 10) {
    pattern = "quarterly";
    confidence = Math.max(0, 100 - (stdDev * 3));
  } else if (avgInterval >= 355 && avgInterval <= 375 && stdDev < 15) {
    pattern = "annual";
    confidence = Math.max(0, 100 - (stdDev * 2));
  }

  // Generate or reuse group ID
  let groupId: string | null = null;
  const existingGroup = matchingTransactions.find(t => t.recurringGroupId);
  if (existingGroup) {
    groupId = existingGroup.recurringGroupId;
  } else if (pattern && confidence >= 60) {
    groupId = `recurring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Project next payment date
  let projectedNextDate: Date | null = null;
  if (pattern && dates.length > 0) {
    const lastDate = new Date(Math.max(...dates));
    projectedNextDate = new Date(lastDate);
    
    switch (pattern) {
      case "weekly":
        projectedNextDate.setDate(projectedNextDate.getDate() + 7);
        break;
      case "biweekly":
        projectedNextDate.setDate(projectedNextDate.getDate() + 14);
        break;
      case "monthly":
        projectedNextDate.setMonth(projectedNextDate.getMonth() + 1);
        break;
      case "quarterly":
        projectedNextDate.setMonth(projectedNextDate.getMonth() + 3);
        break;
      case "annual":
        projectedNextDate.setFullYear(projectedNextDate.getFullYear() + 1);
        break;
    }
  }

  return {
    isRecurring: pattern !== null && confidence >= 60,
    pattern,
    confidence: Math.round(confidence),
    groupId,
    projectedNextDate,
    matchingTransactions: matchingTransactions.map(t => t.id)
  };
}

/**
 * Get all recurring payment groups for an organization
 */
export async function getRecurringGroups(organizationId: string) {
  const recurringTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      isRecurring: true,
      recurringGroupId: { not: null }
    },
    orderBy: { date: "desc" }
  });

  // Group by recurringGroupId
  const groups: Record<string, {
    groupId: string;
    pattern: string | null;
    transactions: typeof recurringTransactions;
    averageAmount: number;
    totalSpent: number;
    nextProjectedDate: Date | null;
    description: string;
  }> = {};

  for (const tx of recurringTransactions) {
    const groupId = tx.recurringGroupId!;
    if (!groups[groupId]) {
      groups[groupId] = {
        groupId,
        pattern: tx.recurringPattern,
        transactions: [],
        averageAmount: 0,
        totalSpent: 0,
        nextProjectedDate: null,
        description: tx.description
      };
    }
    groups[groupId].transactions.push(tx);
  }

  // Calculate stats for each group
  for (const group of Object.values(groups)) {
    group.totalSpent = group.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    group.averageAmount = group.totalSpent / group.transactions.length;
    
    // Project next date
    const lastDate = new Date(Math.max(...group.transactions.map(t => t.date.getTime())));
    group.nextProjectedDate = new Date(lastDate);
    
    switch (group.pattern) {
      case "weekly":
        group.nextProjectedDate.setDate(group.nextProjectedDate.getDate() + 7);
        break;
      case "biweekly":
        group.nextProjectedDate.setDate(group.nextProjectedDate.getDate() + 14);
        break;
      case "monthly":
        group.nextProjectedDate.setMonth(group.nextProjectedDate.getMonth() + 1);
        break;
      case "quarterly":
        group.nextProjectedDate.setMonth(group.nextProjectedDate.getMonth() + 3);
        break;
      case "annual":
        group.nextProjectedDate.setFullYear(group.nextProjectedDate.getFullYear() + 1);
        break;
    }
  }

  return Object.values(groups);
}

/**
 * Get cash flow projection based on recurring payments
 */
export async function getCashFlowProjection(
  organizationId: string,
  months: number = 3
): Promise<{
  projectedExpenses: Array<{ date: Date; amount: number; description: string }>;
  projectedIncome: Array<{ date: Date; amount: number; description: string }>;
  totalProjectedExpenses: number;
  totalProjectedIncome: number;
  netProjection: number;
}> {
  const groups = await getRecurringGroups(organizationId);
  const now = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  const projectedExpenses: Array<{ date: Date; amount: number; description: string }> = [];
  const projectedIncome: Array<{ date: Date; amount: number; description: string }> = [];

  for (const group of groups) {
    if (!group.nextProjectedDate || !group.pattern) continue;

    let nextDate = new Date(group.nextProjectedDate);
    while (nextDate <= endDate) {
      const projection = {
        date: new Date(nextDate),
        amount: group.averageAmount,
        description: group.description
      };

      if (group.averageAmount < 0) {
        projectedExpenses.push(projection);
      } else {
        projectedIncome.push(projection);
      }

      // Advance to next occurrence
      switch (group.pattern) {
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case "biweekly":
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case "quarterly":
          nextDate.setMonth(nextDate.getMonth() + 3);
          break;
        case "annual":
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
      }
    }
  }

  const totalProjectedExpenses = projectedExpenses.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const totalProjectedIncome = projectedIncome.reduce((sum, p) => sum + p.amount, 0);

  return {
    projectedExpenses: projectedExpenses.sort((a, b) => a.date.getTime() - b.date.getTime()),
    projectedIncome: projectedIncome.sort((a, b) => a.date.getTime() - b.date.getTime()),
    totalProjectedExpenses,
    totalProjectedIncome,
    netProjection: totalProjectedIncome - totalProjectedExpenses
  };
}
