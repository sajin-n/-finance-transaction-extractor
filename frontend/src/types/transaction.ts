export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  confidence: number;
  category?: string;
  status: string;
  notes?: string;
  tags?: string[];
  rawText?: string;
  createdAt: string;
  updatedAt?: string;
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
