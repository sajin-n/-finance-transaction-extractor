/**
 * AI-powered transaction extraction using Groq API
 */

interface ExtractedTransaction {
  date: Date;
  description: string;
  amount: number;
  category?: string;
  counterparty?: string;
  confidence: number;
}

interface ExtractionOptions {
  singleTransactionMode?: boolean;
}

interface RawAITransaction {
  date: string;
  description: string;
  amount: number | string;
  category?: string | null;
  counterparty?: string | null;
  confidence?: number | null;
}

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

const STRICT_SCHEMA_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b"
]);

/**
 * Non-blocking startup validator for Groq configuration.
 * Logs clear warnings for missing/invalid keys and network issues.
 */
export async function validateGroqConfiguration(): Promise<void> {
  if (!GROQ_API_KEY) {
    console.warn("[AI] ⚠ GROQ_API_KEY is not set. AI extraction will fall back to regex mode.");
    return;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (response.status === 401 || response.status === 403) {
      console.warn("[AI] ⚠ GROQ_API_KEY appears invalid or unauthorized (401/403). AI extraction will fall back to regex mode.");
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[AI] ⚠ Groq validation returned status ${response.status}. Response: ${body.substring(0, 200)}`);
      return;
    }

    console.log(`[AI] ✓ Groq API configured successfully. Model: ${GROQ_MODEL}`);
  } catch (error) {
    console.warn("[AI] ⚠ Could not validate Groq API key at startup (network or DNS issue).", error);
  }
}

/**
 * Extract transactions from text using Groq AI.
 * Defaults to single-transaction mode because most pasted/receipt payloads are a single bill.
 */
export async function extractTransactionsWithAI(
  text: string,
  options: ExtractionOptions = {}
): Promise<ExtractedTransaction[]> {
  const singleTransactionMode = options.singleTransactionMode !== false;

  if (!GROQ_API_KEY) {
    console.log("[AI] No GROQ_API_KEY configured, using regex fallback");
    return extractWithRegex(text, { singleTransactionMode });
  }
  
  try {
    console.log("[AI] Using Groq API for transaction extraction");
    console.log("[AI] Model:", GROQ_MODEL);
    return await extractWithGroq(text, { singleTransactionMode });
  } catch (error) {
    console.error("[AI] Groq API failed, using regex fallback:", error);
    return extractWithRegex(text, { singleTransactionMode });
  }
}

/**
 * Extract transactions using Groq chat completions with structured output.
 */
async function extractWithGroq(
  text: string,
  options: Required<ExtractionOptions>
): Promise<ExtractedTransaction[]> {
  const strict = STRICT_SCHEMA_MODELS.has(GROQ_MODEL);

  const systemPrompt = [
    "You are a finance transaction extraction engine.",
    "Extract real banking/payment transactions from noisy OCR and receipts.",
    options.singleTransactionMode
      ? "IMPORTANT: The input is expected to represent a single bill/receipt. Return exactly one final transaction for the bill total. Ignore subtotal/tax/item lines unless there is no final total."
      : "Extract all actual transactions in chronological text.",
    "Use negative amount for expenses/debits and positive for income/credits.",
    "Description should be merchant/payee name, not full OCR paragraph.",
    "Date must be YYYY-MM-DD. If unknown, use today's date.",
    "Set confidence from 0 to 1 based on extraction certainty."
  ].join(" ");

  const requestBody: Record<string, unknown> = {
    model: GROQ_MODEL,
    temperature: 0.1,
    n: 1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "transaction_extraction",
        strict,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            transactions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  date: { type: "string" },
                  description: { type: "string" },
                  amount: { type: "number" },
                  category: { type: "string" },
                  counterparty: { type: ["string", "null"] },
                  confidence: { type: "number" }
                },
                required: ["date", "description", "amount", "category", "counterparty", "confidence"]
              }
            }
          },
          required: ["transactions"]
        }
      }
    }
  };

  const response = await fetch(GROQ_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty response content from Groq");
  }

  console.log("[AI] Groq response snippet:", content.substring(0, 300));

  const parsedRoot = JSON.parse(content) as { transactions?: RawAITransaction[] } | RawAITransaction[];
  const rawTransactions = Array.isArray(parsedRoot)
    ? parsedRoot
    : Array.isArray(parsedRoot.transactions)
      ? parsedRoot.transactions
      : [];

  const cleaned = sanitizeTransactions(rawTransactions, text, options);
  console.log(`[AI] Final transactions after sanitization: ${cleaned.length}`);

  return cleaned;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch {
    // Fall through to return today
  }
  
  return new Date();
}

/**
 * Fallback regex-based extraction
 * Handles both:
 * 1. Structured format (Date:, Description:, Amount: on separate lines)
 * 2. Tabular format (date, description, amount on same line)
 */
export function extractWithRegex(text: string, options: ExtractionOptions = {}): ExtractedTransaction[] {
  const singleTransactionMode = options.singleTransactionMode !== false;

  // First, check if this is a structured format with labels
  if (isStructuredFormat(text)) {
    console.log("[Regex] Detected structured format (Date:, Description:, Amount:)");
    const parsed = extractFromStructuredFormat(text);
    return singleTransactionMode ? keepBestSingleTransaction(parsed, text) : parsed;
  }

  // Otherwise, parse line by line for tabular format
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  const transactions: ExtractedTransaction[] = [];

  for (const line of lines) {
    if (isLikelyNonTransactionLine(line)) {
      continue;
    }

    // Skip header lines
    if (line.toLowerCase().includes("date") && line.toLowerCase().includes("description")) {
      continue;
    }

    // Try to parse the line
    const tx = parseTransactionLine(line);
    if (tx) {
      transactions.push(tx);
    }
  }

  return singleTransactionMode ? keepBestSingleTransaction(transactions, text) : transactions;
}

/**
 * Check if text uses structured format with labels
 */
function isStructuredFormat(text: string): boolean {
  const lowerText = text.toLowerCase();
  // Has labeled fields like "Date:", "Description:", "Amount:"
  const hasDate = /\bdate\s*:/i.test(text);
  const hasDesc = /\bdescription\s*:/i.test(text);
  const hasAmount = /\bamount\s*:/i.test(text);
  
  return (hasDate && hasDesc) || (hasDate && hasAmount) || (hasDesc && hasAmount);
}

/**
 * Extract transactions from structured format
 * Handles:
 * Date: 11 Dec 2025
 * Description: STARBUCKS COFFEE MUMBAI
 * Amount: -420.00
 * Balance after transaction: 18,420.50
 */
function extractFromStructuredFormat(text: string): ExtractedTransaction[] {
  const transactions: ExtractedTransaction[] = [];
  
  // Split by transaction blocks (empty lines or "---" separators or start of new Date:)
  // First normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n');
  
  // Split into blocks - each block is a potential transaction
  // A new transaction starts when we see "Date:" after some content
  const blocks: string[] = [];
  let currentBlock = "";
  
  const lines = normalizedText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      // Empty line might end a block
      if (currentBlock.trim()) {
        blocks.push(currentBlock.trim());
        currentBlock = "";
      }
      continue;
    }
    
    // If we see "Date:" and already have content, start a new block
    if (/^date\s*:/i.test(line) && currentBlock.trim()) {
      blocks.push(currentBlock.trim());
      currentBlock = line + "\n";
    } else {
      currentBlock += line + "\n";
    }
  }
  
  // Don't forget the last block
  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }
  
  // If no blocks found, treat the whole text as one block
  if (blocks.length === 0) {
    blocks.push(text);
  }
  
  console.log(`[Regex] Found ${blocks.length} transaction block(s)`);
  
  // Parse each block
  for (const block of blocks) {
    const tx = parseStructuredBlock(block);
    if (tx) {
      transactions.push(tx);
    }
  }
  
  return transactions;
}

/**
 * Parse a structured block into a transaction
 */
function parseStructuredBlock(block: string): ExtractedTransaction | null {
  let date: Date = new Date();
  let description = "";
  let amount = 0;
  let hasAmount = false;
  let balance: number | undefined;
  
  const lines = block.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Parse Date:
    const dateMatch = trimmedLine.match(/^date\s*:\s*(.+)$/i);
    if (dateMatch) {
      const parsedDate = parseDateString(dateMatch[1].trim());
      if (parsedDate) {
        date = parsedDate;
      }
      continue;
    }
    
    // Parse Description:
    const descMatch = trimmedLine.match(/^description\s*:\s*(.+)$/i);
    if (descMatch) {
      description = descMatch[1].trim();
      continue;
    }
    
    // Parse Amount:
    const amountMatch = trimmedLine.match(/^amount\s*:\s*([+-]?\s*[\d,.]+)$/i);
    if (amountMatch) {
      const amtStr = amountMatch[1].replace(/[,\s]/g, '');
      amount = parseFloat(amtStr) || 0;
      hasAmount = true;
      continue;
    }
    
    // Parse Balance (optional):
    const balanceMatch = trimmedLine.match(/^balance(?:\s+after\s+transaction)?\s*:\s*([+-]?\s*[\d,.]+)$/i);
    if (balanceMatch) {
      const balStr = balanceMatch[1].replace(/[,\s]/g, '');
      balance = parseFloat(balStr) || 0;
      continue;
    }
  }
  
  // Must have a valid amount and meaningful description
  if (!hasAmount || amount === 0 || !description) {
    console.log("[Regex] Block rejected - no description or amount:", block.substring(0, 50));
    return null;
  }
  
  const category = categorizeByDescription(description);
  
  console.log(`[Regex] Parsed structured transaction: ${description}, $${amount}, ${date.toISOString().split('T')[0]}`);
  
  return {
    date,
    description,
    amount,
    category,
    confidence: 0.85 // Higher confidence for structured format
  };
}

/**
 * Parse various date string formats
 */
function parseDateString(dateStr: string): Date | null {
  // Try standard date parsing
  let date = new Date(dateStr);
  if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
    return date;
  }
  
  // Try "11 Dec 2025" format
  const match = dateStr.match(/^(\d{1,2})\s+(\w{3,})\s+(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const monthMap: Record<string, number> = {
      'jan': 0, 'january': 0,
      'feb': 1, 'february': 1,
      'mar': 2, 'march': 2,
      'apr': 3, 'april': 3,
      'may': 4,
      'jun': 5, 'june': 5,
      'jul': 6, 'july': 6,
      'aug': 7, 'august': 7,
      'sep': 8, 'september': 8,
      'oct': 9, 'october': 9,
      'nov': 10, 'november': 10,
      'dec': 11, 'december': 11
    };
    
    const monthNum = monthMap[month.toLowerCase()];
    if (monthNum !== undefined) {
      date = new Date(parseInt(year), monthNum, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  // Try "DD/MM/YYYY" format
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

/**
 * Parse a single transaction line using regex patterns
 */
function parseTransactionLine(line: string): ExtractedTransaction | null {
  // Pattern 1: Date  Description  Amount (with optional sign)
  // e.g., "2024-01-15  Coffee Shop  -4.50" or "2024-01-15,Coffee Shop,-4.50"
  
  // Date patterns
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,           // 2024-01-15
    /(\d{2}\/\d{2}\/\d{4})/,         // 01/15/2024
    /(\d{2}-\d{2}-\d{4})/,           // 15-01-2024
    /(\d{1,2}\s+\w{3}\s+\d{4})/,     // 15 Jan 2024
  ];

  // Amount patterns (captures sign and number)
  const amountPatterns = [
    /([+-]?\$?\s*[\d,]+\.?\d*)\s*$/,           // End of line: -4.50 or +3500.00
    /([+-]?\$?\s*[\d,]+\.?\d*)\s*(?:\w+)?$/,   // End with optional word
    /([+-])?\s*\$?\s*([\d,]+\.?\d*)/,          // Anywhere: +$3,500.00
  ];

  let date: Date | null = null;
  let amount = 0;
  let hasAmount = false;
  let description = line;

  // Extract date
  for (const pattern of datePatterns) {
    const match = line.match(pattern);
    if (match) {
      try {
        date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          description = line.replace(match[0], "").trim();
          break;
        }
      } catch {
        // Continue trying other patterns
      }
    }
  }

  // Extract amount
  for (const pattern of amountPatterns) {
    const match = description.match(pattern);
    if (match) {
      let amountStr = match[1] || match[2] || "";
      amountStr = amountStr.replace(/[$,\s]/g, "");
      const parsedAmount = parseFloat(amountStr);
      if (!isNaN(parsedAmount) && Math.abs(parsedAmount) > 0) {
        amount = parsedAmount;
        hasAmount = true;
        // Check for sign
        if (match[0].includes("-") || line.includes("-" + Math.abs(amount))) {
          amount = -Math.abs(amount);
        } else if (match[0].includes("+")) {
          amount = Math.abs(amount);
        }
        description = description.replace(match[0], "").trim();
        break;
      }
    }
  }

  // Clean up description - remove commas at start/end, extra whitespace
  description = description.replace(/^[,\s]+|[,\s]+$/g, "").replace(/\s+/g, " ").trim();

  // If no date found, use today
  if (!date) {
    date = new Date();
  }

  // Skip if no meaningful description
  if (!description || description.length < 2) {
    return null;
  }

  // Must include a valid, non-zero amount to be considered a transaction.
  if (!hasAmount) {
    return null;
  }

  // Determine category based on description
  const category = categorizeByDescription(description);

  return {
    date,
    description,
    amount,
    category,
    confidence: 0.7 // Medium confidence for regex extraction
  };
}

/**
 * Categorize transaction based on description keywords
 */
function categorizeByDescription(description: string): string {
  const lower = description.toLowerCase();

  const categories: Record<string, string[]> = {
    "Food": ["coffee", "restaurant", "cafe", "grocery", "food", "pizza", "burger", "starbucks", "mcdonald", "lunch", "dinner", "breakfast"],
    "Shopping": ["amazon", "shop", "store", "mall", "purchase", "buy", "ebay", "walmart", "target", "office supplies"],
    "Transportation": ["gas", "fuel", "uber", "lyft", "taxi", "parking", "transit", "metro", "bus", "train"],
    "Entertainment": ["netflix", "spotify", "movie", "theater", "game", "steam", "playstation", "xbox", "hulu", "disney"],
    "Bills": ["electric", "water", "internet", "phone", "insurance", "rent", "mortgage", "utility", "bill"],
    "Income": ["salary", "deposit", "payment received", "refund", "income", "paycheck", "direct deposit"],
    "Transfer": ["transfer", "wire", "crypto", "exchange", "atm", "withdrawal", "cash"],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return category;
    }
  }

  return "Other";
}

/**
 * Extract single transaction (for backward compatibility)
 */
export function extractSingleTransaction(text: string): ExtractedTransaction | null {
  const transactions = extractWithRegex(text, { singleTransactionMode: true });
  return transactions.length > 0 ? transactions[0] : null;
}

function sanitizeTransactions(
  rawTransactions: RawAITransaction[],
  sourceText: string,
  options: Required<ExtractionOptions>
): ExtractedTransaction[] {
  const seen = new Set<string>();
  const cleaned: ExtractedTransaction[] = [];

  for (const tx of rawTransactions) {
    const description = normalizeDescription(tx.description || "");
    const amount = toAmount(tx.amount);

    if (!description || Math.abs(amount) < 0.0001) {
      continue;
    }

    if (isLikelyNonTransactionLine(description)) {
      continue;
    }

    const parsed: ExtractedTransaction = {
      date: parseDate(tx.date),
      description,
      amount,
      category: tx.category || "Other",
      counterparty: tx.counterparty || undefined,
      confidence: clampConfidence(typeof tx.confidence === "number" ? tx.confidence : 0.85)
    };

    const key = `${parsed.date.toISOString().slice(0, 10)}|${parsed.amount.toFixed(2)}|${parsed.description.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(parsed);
  }

  if (!options.singleTransactionMode) {
    return cleaned;
  }

  return keepBestSingleTransaction(cleaned, sourceText);
}

function keepBestSingleTransaction(transactions: ExtractedTransaction[], sourceText: string): ExtractedTransaction[] {
  if (transactions.length <= 1) {
    return transactions;
  }

  const lowerSource = sourceText.toLowerCase();
  const receiptLike = /(invoice|receipt|bill|total|subtotal|tax|gst|amount paid)/i.test(lowerSource);

  const sorted = [...transactions].sort((a, b) => scoreTransaction(b, receiptLike) - scoreTransaction(a, receiptLike));
  return [sorted[0]];
}

function scoreTransaction(tx: ExtractedTransaction, receiptLike: boolean): number {
  const base = Math.abs(tx.amount);
  const confidenceScore = tx.confidence * 100;
  const descPenalty = /(tax|gst|cgst|sgst|subtotal|tip|discount|fee|balance)/i.test(tx.description) ? -40 : 0;
  const receiptBoost = receiptLike ? Math.abs(tx.amount) * 0.25 : 0;
  return base + confidenceScore + descPenalty + receiptBoost;
}

function toAmount(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = parseFloat(String(value).replace(/[,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDescription(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "").trim();
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function isLikelyNonTransactionLine(line: string): boolean {
  const lower = line.toLowerCase();
  const patterns = [
    /opening\s+balance/,
    /closing\s+balance/,
    /available\s+balance/,
    /balance\s+after\s+transaction/,
    /^balance\b/,
    /^statement\b/,
    /^account\s+number\b/,
    /^ifsc\b/,
    /^branch\b/
  ];
  return patterns.some((pattern) => pattern.test(lower));
}
