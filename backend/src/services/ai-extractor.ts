/**
 * AI-powered transaction extraction using Ollama Cloud API
 */
import { Ollama } from "ollama";

interface ExtractedTransaction {
  date: Date;
  description: string;
  amount: number;
  category?: string;
  counterparty?: string;
  confidence: number;
}

// Ollama Cloud API Configuration
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// Create Ollama client configured for cloud API
const ollama = new Ollama({
  host: "https://ollama.com",
  headers: {
    "Authorization": `Bearer ${OLLAMA_API_KEY}`
  }
});

/**
 * Extract transactions from text using Ollama Cloud AI
 */
export async function extractTransactionsWithAI(text: string): Promise<ExtractedTransaction[]> {
  // Check if API key is configured
  if (!OLLAMA_API_KEY) {
    console.log("[AI] No OLLAMA_API_KEY configured, using regex fallback");
    return extractWithRegex(text);
  }
  
  try {
    console.log("[AI] Using Ollama Cloud API for transaction extraction");
    console.log("[AI] Model:", OLLAMA_MODEL);
    return await extractWithOllamaCloud(text);
  } catch (error) {
    console.error("[AI] Ollama Cloud API failed, using regex fallback:", error);
    return extractWithRegex(text);
  }
}

/**
 * Extract transactions using Ollama Cloud API (official library)
 */
async function extractWithOllamaCloud(text: string): Promise<ExtractedTransaction[]> {
  const systemPrompt = `You are a financial transaction parser. Extract transaction data from text and return JSON.
For each transaction, identify:
- date: in YYYY-MM-DD format (use today's date if not found)
- description: the merchant or transaction description  
- amount: as a number (negative for expenses/debits, positive for income/credits)
- category: one of: Food, Shopping, Transportation, Entertainment, Bills, Income, Transfer, Other
- counterparty: the other party if mentioned (optional)

Return a JSON object with a "transactions" array containing the extracted data.`;

  const userPrompt = `Extract all transactions from this text:

${text}

Return JSON: {"transactions": [{"date":"YYYY-MM-DD","description":"...","amount":0,"category":"..."}]}`;

  const response = await ollama.chat({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    stream: false,
    format: "json",
    options: {
      temperature: 0.1,  // Lower temperature for more deterministic output
      num_predict: 2048  // Ensure enough tokens for response
    }
  });

  const content = response.message?.content?.trim();

  if (!content) {
    console.error("[AI] Empty response from Ollama Cloud");
    throw new Error("Empty response from AI");
  }

  console.log("[AI] Ollama Cloud response:", content.substring(0, 300));

  // Parse JSON response - with format: "json", the response should be valid JSON
  let parsed: Array<{
    date: string;
    description: string;
    amount: number | string;
    category?: string;
    counterparty?: string;
  }>;
  
  try {
    const jsonResponse = JSON.parse(content);
    
    // Handle both array format and object with transactions array
    if (Array.isArray(jsonResponse)) {
      parsed = jsonResponse;
    } else if (jsonResponse.transactions && Array.isArray(jsonResponse.transactions)) {
      parsed = jsonResponse.transactions;
    } else {
      // Try to extract JSON array from content as fallback
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("[AI] No JSON array found in response:", content);
        throw new Error("No valid JSON in response");
      }
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (parseError) {
    // Fallback: try to extract JSON array from content
    const cleanContent = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[AI] Failed to parse JSON response:", content);
      throw new Error("Invalid JSON response from AI");
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  console.log(`[AI] Successfully parsed ${parsed.length} transactions with AI`);

  return parsed.map(tx => ({
    date: parseDate(tx.date),
    description: tx.description || "Unknown Transaction",
    amount: typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount).replace(/[,$]/g, "")) || 0,
    category: tx.category || "Other",
    counterparty: tx.counterparty || undefined,
    confidence: 0.95 // High confidence for AI extraction
  }));
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
export function extractWithRegex(text: string): ExtractedTransaction[] {
  // First, check if this is a structured format with labels
  if (isStructuredFormat(text)) {
    console.log("[Regex] Detected structured format (Date:, Description:, Amount:)");
    return extractFromStructuredFormat(text);
  }

  // Otherwise, parse line by line for tabular format
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  const transactions: ExtractedTransaction[] = [];

  for (const line of lines) {
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

  return transactions;
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
  
  // Must have at least a description or amount
  if (!description && amount === 0) {
    console.log("[Regex] Block rejected - no description or amount:", block.substring(0, 50));
    return null;
  }
  
  // Use a default description if missing
  if (!description) {
    description = "Transaction";
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
      if (!isNaN(parsedAmount)) {
        amount = parsedAmount;
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
  const transactions = extractWithRegex(text);
  return transactions.length > 0 ? transactions[0] : null;
}
