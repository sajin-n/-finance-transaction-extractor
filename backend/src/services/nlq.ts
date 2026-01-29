import { prisma } from "../prisma";

/**
 * Natural Language Query Service
 * Parses human-readable queries and converts them to database filters
 */

export interface NLQResult {
  query: string;
  parsedIntent: ParsedIntent;
  sqlLikeDescription: string;
  transactions: Array<{
    id: string;
    amount: number;
    description: string;
    date: Date;
    category: string | null;
    counterparty: string | null;
  }>;
  totalCount: number;
  aggregations?: {
    sum?: number;
    avg?: number;
    min?: number;
    max?: number;
    count?: number;
  };
}

interface ParsedIntent {
  action: "list" | "sum" | "count" | "average" | "find";
  filters: {
    amountMin?: number;
    amountMax?: number;
    amountEquals?: number;
    dateFrom?: Date;
    dateTo?: Date;
    categories?: string[];
    counterparties?: string[];
    descriptionKeywords?: string[];
    transactionType?: "income" | "expense";
  };
  sortBy?: "amount" | "date";
  sortOrder?: "asc" | "desc";
  limit?: number;
}

// Pattern matchers for natural language
const AMOUNT_PATTERNS = {
  over: /(?:over|above|more than|greater than|>\s*)\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
  under: /(?:under|below|less than|smaller than|<\s*)\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
  between: /(?:between)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:and|to|-)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
  exactly: /(?:exactly|equal to|=\s*)\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i
};

const DATE_PATTERNS = {
  lastNDays: /(?:last|past)\s+(\d+)\s+days?/i,
  lastNMonths: /(?:last|past)\s+(\d+)\s+months?/i,
  lastNWeeks: /(?:last|past)\s+(\d+)\s+weeks?/i,
  thisMonth: /this\s+month/i,
  lastMonth: /last\s+month/i,
  thisYear: /this\s+year/i,
  lastYear: /last\s+year/i,
  today: /today/i,
  yesterday: /yesterday/i,
  thisWeek: /this\s+week/i,
  lastWeek: /last\s+week/i,
  beforeDate: /before\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  afterDate: /after\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  inMonth: /in\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/i
};

const CATEGORY_KEYWORDS = [
  "groceries", "food", "dining", "restaurants", "entertainment",
  "utilities", "rent", "mortgage", "insurance", "healthcare",
  "transportation", "travel", "shopping", "subscriptions",
  "salary", "income", "refund", "transfer", "payment"
];

const ACTION_PATTERNS = {
  sum: /(?:sum|total|how much|spent|earned)/i,
  count: /(?:how many|count|number of)/i,
  average: /(?:average|avg|mean)/i,
  find: /(?:find|show|list|get|search|all)/i
};

/**
 * Parse a natural language query
 */
export function parseNaturalLanguageQuery(query: string): ParsedIntent {
  const lowerQuery = query.toLowerCase();
  const intent: ParsedIntent = {
    action: "list",
    filters: {}
  };

  // Determine action
  if (ACTION_PATTERNS.sum.test(lowerQuery)) {
    intent.action = "sum";
  } else if (ACTION_PATTERNS.count.test(lowerQuery)) {
    intent.action = "count";
  } else if (ACTION_PATTERNS.average.test(lowerQuery)) {
    intent.action = "average";
  } else {
    intent.action = "list";
  }

  // Parse amount filters
  let match: RegExpExecArray | null;

  if ((match = AMOUNT_PATTERNS.between.exec(query))) {
    intent.filters.amountMin = parseNumber(match[1]);
    intent.filters.amountMax = parseNumber(match[2]);
  } else if ((match = AMOUNT_PATTERNS.over.exec(query))) {
    intent.filters.amountMin = parseNumber(match[1]);
  } else if ((match = AMOUNT_PATTERNS.under.exec(query))) {
    intent.filters.amountMax = parseNumber(match[1]);
  } else if ((match = AMOUNT_PATTERNS.exactly.exec(query))) {
    intent.filters.amountEquals = parseNumber(match[1]);
  }

  // Parse date filters
  if (DATE_PATTERNS.today.test(lowerQuery)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    intent.filters.dateFrom = today;
    intent.filters.dateTo = tomorrow;
  } else if (DATE_PATTERNS.yesterday.test(lowerQuery)) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    intent.filters.dateFrom = yesterday;
    intent.filters.dateTo = today;
  } else if ((match = DATE_PATTERNS.lastNDays.exec(lowerQuery))) {
    const days = parseInt(match[1], 10);
    const from = new Date();
    from.setDate(from.getDate() - days);
    intent.filters.dateFrom = from;
  } else if ((match = DATE_PATTERNS.lastNWeeks.exec(lowerQuery))) {
    const weeks = parseInt(match[1], 10);
    const from = new Date();
    from.setDate(from.getDate() - (weeks * 7));
    intent.filters.dateFrom = from;
  } else if ((match = DATE_PATTERNS.lastNMonths.exec(lowerQuery))) {
    const months = parseInt(match[1], 10);
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    intent.filters.dateFrom = from;
  } else if (DATE_PATTERNS.thisMonth.test(lowerQuery)) {
    const now = new Date();
    intent.filters.dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    intent.filters.dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (DATE_PATTERNS.lastMonth.test(lowerQuery)) {
    const now = new Date();
    intent.filters.dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    intent.filters.dateTo = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (DATE_PATTERNS.thisYear.test(lowerQuery)) {
    const now = new Date();
    intent.filters.dateFrom = new Date(now.getFullYear(), 0, 1);
  } else if (DATE_PATTERNS.lastYear.test(lowerQuery)) {
    const now = new Date();
    intent.filters.dateFrom = new Date(now.getFullYear() - 1, 0, 1);
    intent.filters.dateTo = new Date(now.getFullYear(), 0, 1);
  }

  // Parse transaction type
  if (/(?:expenses?|spent|paid|debits?|outgoing)/i.test(lowerQuery)) {
    intent.filters.transactionType = "expense";
  } else if (/(?:income|earned|received|credits?|incoming|deposits?)/i.test(lowerQuery)) {
    intent.filters.transactionType = "income";
  }

  // Parse categories
  const foundCategories = CATEGORY_KEYWORDS.filter(cat => 
    lowerQuery.includes(cat)
  );
  if (foundCategories.length > 0) {
    intent.filters.categories = foundCategories;
  }

  // Parse keywords for description search
  const quotedPhrases = query.match(/"([^"]+)"/g);
  if (quotedPhrases) {
    intent.filters.descriptionKeywords = quotedPhrases.map(p => p.replace(/"/g, ""));
  }

  // Parse sorting
  if (/(?:largest|biggest|highest|most)/i.test(lowerQuery)) {
    intent.sortBy = "amount";
    intent.sortOrder = "desc";
  } else if (/(?:smallest|lowest|least)/i.test(lowerQuery)) {
    intent.sortBy = "amount";
    intent.sortOrder = "asc";
  } else if (/(?:newest|recent|latest)/i.test(lowerQuery)) {
    intent.sortBy = "date";
    intent.sortOrder = "desc";
  } else if (/(?:oldest|earliest)/i.test(lowerQuery)) {
    intent.sortBy = "date";
    intent.sortOrder = "asc";
  }

  // Parse limit
  const limitMatch = /(?:top|first|last)\s+(\d+)/i.exec(query);
  if (limitMatch) {
    intent.limit = parseInt(limitMatch[1], 10);
  }

  return intent;
}

function parseNumber(str: string): number {
  return parseFloat(str.replace(/,/g, ""));
}

/**
 * Execute a natural language query
 */
export async function executeNaturalLanguageQuery(
  query: string,
  organizationId: string
): Promise<NLQResult> {
  const parsedIntent = parseNaturalLanguageQuery(query);
  
  // Build Prisma where clause
  const where: Record<string, unknown> = { organizationId };

  if (parsedIntent.filters.amountEquals !== undefined) {
    where.amount = parsedIntent.filters.amountEquals;
  } else {
    if (parsedIntent.filters.amountMin !== undefined || parsedIntent.filters.amountMax !== undefined) {
      where.amount = {};
      if (parsedIntent.filters.amountMin !== undefined) {
        (where.amount as Record<string, number>).gte = parsedIntent.filters.transactionType === "expense" 
          ? -parsedIntent.filters.amountMin 
          : parsedIntent.filters.amountMin;
      }
      if (parsedIntent.filters.amountMax !== undefined) {
        (where.amount as Record<string, number>).lte = parsedIntent.filters.transactionType === "expense"
          ? -parsedIntent.filters.amountMax
          : parsedIntent.filters.amountMax;
      }
    }
  }

  if (parsedIntent.filters.transactionType === "expense") {
    where.amount = { ...(where.amount as object || {}), lt: 0 };
  } else if (parsedIntent.filters.transactionType === "income") {
    where.amount = { ...(where.amount as object || {}), gt: 0 };
  }

  if (parsedIntent.filters.dateFrom || parsedIntent.filters.dateTo) {
    where.date = {};
    if (parsedIntent.filters.dateFrom) {
      (where.date as Record<string, Date>).gte = parsedIntent.filters.dateFrom;
    }
    if (parsedIntent.filters.dateTo) {
      (where.date as Record<string, Date>).lte = parsedIntent.filters.dateTo;
    }
  }

  if (parsedIntent.filters.categories && parsedIntent.filters.categories.length > 0) {
    where.category = { in: parsedIntent.filters.categories };
  }

  if (parsedIntent.filters.descriptionKeywords && parsedIntent.filters.descriptionKeywords.length > 0) {
    where.description = {
      contains: parsedIntent.filters.descriptionKeywords[0],
      mode: "insensitive"
    };
  }

  // Build orderBy
  const orderBy: Record<string, string> = {};
  if (parsedIntent.sortBy) {
    orderBy[parsedIntent.sortBy] = parsedIntent.sortOrder || "desc";
  } else {
    orderBy.date = "desc";
  }

  // Execute query
  const transactions = await prisma.transaction.findMany({
    where,
    orderBy,
    take: parsedIntent.limit || 50,
    select: {
      id: true,
      amount: true,
      description: true,
      date: true,
      category: true,
      counterparty: true
    }
  });

  const totalCount = await prisma.transaction.count({ where });

  // Calculate aggregations if needed
  let aggregations: NLQResult["aggregations"];
  if (parsedIntent.action !== "list") {
    const aggResult = await prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
      _avg: { amount: true },
      _min: { amount: true },
      _max: { amount: true },
      _count: true
    });

    aggregations = {
      sum: aggResult._sum.amount || 0,
      avg: aggResult._avg.amount || 0,
      min: aggResult._min.amount || 0,
      max: aggResult._max.amount || 0,
      count: aggResult._count
    };
  }

  // Generate human-readable SQL description
  const sqlLikeDescription = generateSQLDescription(parsedIntent);

  return {
    query,
    parsedIntent,
    sqlLikeDescription,
    transactions,
    totalCount,
    aggregations
  };
}

/**
 * Generate a SQL-like description of the parsed query
 */
function generateSQLDescription(intent: ParsedIntent): string {
  const parts: string[] = [];

  // SELECT
  switch (intent.action) {
    case "sum":
      parts.push("SELECT SUM(amount)");
      break;
    case "count":
      parts.push("SELECT COUNT(*)");
      break;
    case "average":
      parts.push("SELECT AVG(amount)");
      break;
    default:
      parts.push("SELECT *");
  }

  parts.push("FROM transactions");

  // WHERE
  const conditions: string[] = [];
  
  if (intent.filters.amountMin !== undefined) {
    conditions.push(`amount >= $${intent.filters.amountMin}`);
  }
  if (intent.filters.amountMax !== undefined) {
    conditions.push(`amount <= $${intent.filters.amountMax}`);
  }
  if (intent.filters.amountEquals !== undefined) {
    conditions.push(`amount = $${intent.filters.amountEquals}`);
  }
  if (intent.filters.transactionType === "expense") {
    conditions.push("amount < 0");
  }
  if (intent.filters.transactionType === "income") {
    conditions.push("amount > 0");
  }
  if (intent.filters.dateFrom) {
    conditions.push(`date >= '${intent.filters.dateFrom.toISOString().split("T")[0]}'`);
  }
  if (intent.filters.dateTo) {
    conditions.push(`date <= '${intent.filters.dateTo.toISOString().split("T")[0]}'`);
  }
  if (intent.filters.categories && intent.filters.categories.length > 0) {
    conditions.push(`category IN ('${intent.filters.categories.join("', '")}')`);
  }
  if (intent.filters.descriptionKeywords && intent.filters.descriptionKeywords.length > 0) {
    conditions.push(`description ILIKE '%${intent.filters.descriptionKeywords[0]}%'`);
  }

  if (conditions.length > 0) {
    parts.push(`WHERE ${conditions.join(" AND ")}`);
  }

  // ORDER BY
  if (intent.sortBy) {
    parts.push(`ORDER BY ${intent.sortBy} ${intent.sortOrder?.toUpperCase() || "DESC"}`);
  }

  // LIMIT
  if (intent.limit) {
    parts.push(`LIMIT ${intent.limit}`);
  }

  return parts.join(" ");
}

/**
 * Get query suggestions based on data in the system
 */
export async function getQuerySuggestions(organizationId: string): Promise<string[]> {
  const suggestions: string[] = [
    "Show me all expenses over $100 this month",
    "How much did I spend on groceries last month?",
    "List the top 10 largest transactions",
    "What's my total income this year?",
    "Show recent transactions from Amazon",
    "Count all transactions in the last 30 days",
    "Average transaction amount this month",
    "Find all subscriptions",
    "Show expenses between $50 and $200"
  ];

  // Add dynamic suggestions based on actual data
  const categories = await prisma.transaction.findMany({
    where: { organizationId },
    select: { category: true },
    distinct: ["category"]
  });

  for (const cat of categories.slice(0, 5)) {
    if (cat.category) {
      suggestions.push(`How much did I spend on ${cat.category}?`);
    }
  }

  return suggestions;
}
