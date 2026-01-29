export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  confidence: number;
  overallConfidence?: number;
  category?: string;
  counterparty?: string;
  status: string;
  notes?: string;
  tags?: string[];
  rawText?: string;
  createdAt: string;
  updatedAt?: string;
  
  // Maker-Checker / Review fields
  reviewStatus?: "none" | "pending" | "approved" | "rejected" | "auto_approved";
  reviewRequestedAt?: string;
  reviewedAt?: string;
  
  // Anomaly Detection
  isAnomaly?: boolean;
  anomalyScore?: number;
  anomalyReasons?: string[];
  
  // Recurring Detection
  isRecurring?: boolean;
  recurringPattern?: string;
  
  // PII Detection
  hasPII?: boolean;
  maskedDescription?: string;
  
  // Related Party
  isRelatedParty?: boolean;
  relatedPartyName?: string;
};

export type TransactionsResponse = {
  data: Transaction[];
  nextCursor: string | null;
};

export type TransactionStats = {
  total: number;
  income: {
    total: number;
    count: number;
  };
  expenses: {
    total: number;
    count: number;
  };
  byCategory: Array<{
    category: string | null;
    _sum: { amount: number | null };
    _count: number;
  }>;
  byStatus: Array<{
    status: string;
    _count: number;
  }>;
};
