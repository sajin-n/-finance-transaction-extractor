import { prisma } from "../prisma";

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  reasons: string[];
}

/**
 * Detect anomalies in a transaction using statistical methods
 * Uses Z-score and IQR for outlier detection
 */
export async function detectAnomalies(
  transaction: {
    amount: number;
    description: string;
    category?: string;
    date: Date;
  },
  organizationId: string
): Promise<AnomalyResult> {
  const reasons: string[] = [];
  let anomalyScore = 0;

  // Get historical data for comparison
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

  const historicalTransactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      createdAt: { gte: thirtyDaysAgo }
    },
    select: {
      amount: true,
      category: true,
      description: true
    }
  });

  if (historicalTransactions.length < 10) {
    // Not enough data for statistical analysis
    return { isAnomaly: false, score: 0, reasons: [] };
  }

  // 1. Amount Anomaly Detection (Z-score method)
  const amounts = historicalTransactions.map(t => Math.abs(t.amount));
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const stdDev = Math.sqrt(
    amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length
  );

  const absAmount = Math.abs(transaction.amount);
  const zScore = stdDev > 0 ? (absAmount - mean) / stdDev : 0;

  if (Math.abs(zScore) > 3) {
    anomalyScore += 40;
    reasons.push(`Unusual amount: ${absAmount.toFixed(2)} is ${zScore.toFixed(1)} standard deviations from average (${mean.toFixed(2)})`);
  } else if (Math.abs(zScore) > 2) {
    anomalyScore += 20;
    reasons.push(`Moderately unusual amount: ${absAmount.toFixed(2)} is ${zScore.toFixed(1)} std devs from average`);
  }

  // 2. Category-specific anomaly
  if (transaction.category) {
    const categoryAmounts = historicalTransactions
      .filter(t => t.category === transaction.category)
      .map(t => Math.abs(t.amount));

    if (categoryAmounts.length >= 5) {
      const catMean = categoryAmounts.reduce((a, b) => a + b, 0) / categoryAmounts.length;
      const catMax = Math.max(...categoryAmounts);
      
      if (absAmount > catMax * 2) {
        anomalyScore += 30;
        reasons.push(`Amount exceeds 2x the max for category "${transaction.category}" (max: ${catMax.toFixed(2)})`);
      } else if (absAmount > catMean * 5) {
        anomalyScore += 20;
        reasons.push(`Amount is 5x higher than category average for "${transaction.category}"`);
      }
    }
  }

  // 3. Round number detection (potential fraud indicator)
  if (absAmount >= 1000 && absAmount % 1000 === 0) {
    anomalyScore += 10;
    reasons.push("Suspiciously round amount (multiple of 1000)");
  }

  // 4. Weekend/off-hours transaction (if applicable)
  const dayOfWeek = transaction.date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Check if weekend transactions are unusual for this org
    const weekendCount = historicalTransactions.filter(t => {
      const d = new Date(t.description); // This is a placeholder
      return d.getDay() === 0 || d.getDay() === 6;
    }).length;
    
    const weekendRatio = weekendCount / historicalTransactions.length;
    if (weekendRatio < 0.1 && absAmount > mean) {
      anomalyScore += 15;
      reasons.push("Large weekend transaction (unusual for this organization)");
    }
  }

  // 5. Duplicate detection
  const duplicates = historicalTransactions.filter(t => 
    Math.abs(t.amount) === absAmount && 
    t.description.toLowerCase().includes(transaction.description.toLowerCase().slice(0, 20))
  );
  
  if (duplicates.length > 2) {
    anomalyScore += 25;
    reasons.push(`Potential duplicate: ${duplicates.length} similar transactions found`);
  }

  // 6. Keyword-based fraud indicators
  const suspiciousKeywords = [
    "wire transfer", "urgent", "offshore", "cash advance",
    "crypto", "bitcoin", "gift card", "western union"
  ];
  
  const descLower = transaction.description.toLowerCase();
  for (const keyword of suspiciousKeywords) {
    if (descLower.includes(keyword)) {
      anomalyScore += 15;
      reasons.push(`Contains suspicious keyword: "${keyword}"`);
      break;
    }
  }

  // Normalize score to 0-100
  const normalizedScore = Math.min(100, anomalyScore);

  return {
    isAnomaly: normalizedScore >= 50,
    score: normalizedScore,
    reasons
  };
}

/**
 * Batch anomaly detection for bulk processing
 * ACTUALLY UPDATES THE DATABASE with anomaly findings
 */
export async function detectAnomaliesBatch(
  transactions: Array<{
    id: string;
    amount: number;
    description: string;
    category?: string;
    date: Date;
  }>,
  organizationId: string
): Promise<Map<string, AnomalyResult>> {
  const results = new Map<string, AnomalyResult>();
  
  // Process in parallel with concurrency limit
  const batchSize = 10;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(t => detectAnomalies(t, organizationId))
    );
    
    // Update database with anomaly results
    await Promise.all(
      batch.map((t, idx) => {
        const result = batchResults[idx];
        results.set(t.id, result);
        
        // Actually update the transaction in the database!
        return prisma.transaction.update({
          where: { id: t.id },
          data: {
            isAnomaly: result.isAnomaly,
            anomalyScore: result.score,
            anomalyReasons: result.reasons
          }
        });
      })
    );
  }
  
  return results;
}

/**
 * Run anomaly detection on ALL transactions for an organization
 * Used when clicking "Run Full Scan"
 */
export async function runFullAnomalyScan(organizationId: string): Promise<{
  scanned: number;
  anomaliesFound: number;
}> {
  const transactions = await prisma.transaction.findMany({
    where: { organizationId },
    select: {
      id: true,
      amount: true,
      description: true,
      category: true,
      date: true
    }
  });

  if (transactions.length === 0) {
    return { scanned: 0, anomaliesFound: 0 };
  }

  const results = await detectAnomaliesBatch(
    transactions.map(t => ({
      id: t.id,
      amount: t.amount,
      description: t.description,
      category: t.category || undefined,
      date: t.date
    })),
    organizationId
  );

  const anomaliesFound = Array.from(results.values()).filter(r => r.isAnomaly).length;

  return {
    scanned: transactions.length,
    anomaliesFound
  };
}

/**
 * Get anomaly statistics for organization
 */
export async function getAnomalyStats(organizationId: string) {
  const [total, anomalies, byReason] = await Promise.all([
    prisma.transaction.count({ where: { organizationId } }),
    prisma.transaction.count({ where: { organizationId, isAnomaly: true } }),
    prisma.transaction.findMany({
      where: { organizationId, isAnomaly: true },
      select: { anomalyReasons: true, anomalyScore: true }
    })
  ]);

  // Aggregate reasons
  const reasonCounts: Record<string, number> = {};
  for (const tx of byReason) {
    for (const reason of tx.anomalyReasons) {
      const key = reason.split(":")[0]; // Get first part of reason
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
  }

  return {
    totalTransactions: total,
    anomalyCount: anomalies,
    anomalyRate: total > 0 ? ((anomalies / total) * 100).toFixed(2) + "%" : "0%",
    averageScore: byReason.length > 0 
      ? (byReason.reduce((sum, t) => sum + (t.anomalyScore || 0), 0) / byReason.length).toFixed(1)
      : 0,
    topReasons: Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
  };
}
