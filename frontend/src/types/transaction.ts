export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  confidence: number;
  createdAt: string;
};

export type TransactionsResponse = {
  data: Transaction[];
  nextCursor: string | null;
};
