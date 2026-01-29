/**
 * File Parser Service
 * Handles CSV, PDF, TXT, and Excel file parsing for transaction extraction
 */
import pdfParse from "pdf-parse";
import { parse as csvParse } from "csv-parse/sync";

// Fix for pdf-parse types - it exports a default function
const parsePDF = pdfParse as unknown as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  category?: string;
  counterparty?: string;
  balance?: number;
  confidence: number;
}

interface CSVRecord {
  [key: string]: string;
}

/**
 * Parse a file and extract transactions based on file type
 */
export async function parseFile(file: File): Promise<ParsedTransaction[]> {
  const fileName = file.name.toLowerCase();
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  
  if (fileName.endsWith(".pdf")) {
    return parsePDFFile(fileBuffer);
  } else if (fileName.endsWith(".csv")) {
    const text = await file.text();
    return parseCSV(text);
  } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    // For Excel files, we'd need xlsx library - for now, return error
    throw new Error("Excel files (.xlsx/.xls) are not yet supported. Please convert to CSV.");
  } else {
    // Treat as plain text
    const text = await file.text();
    return parseText(text);
  }
}

/**
 * Parse PDF file and extract transactions
 */
async function parsePDFFile(buffer: Buffer): Promise<ParsedTransaction[]> {
  try {
    const data = await parsePDF(buffer);
    const text = data.text;
    
    console.log("[PDF] Extracted text length:", text.length);
    console.log("[PDF] Sample text:", text.substring(0, 500));
    
    // Parse the extracted text
    return parseText(text);
  } catch (error) {
    console.error("[PDF] Parse error:", error);
    throw new Error("Failed to parse PDF file. Please ensure it's a valid PDF.");
  }
}

/**
 * Parse CSV file and extract transactions
 */
function parseCSV(text: string): ParsedTransaction[] {
  try {
    // Try to parse with headers first
    const records = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      skip_records_with_error: true
    }) as CSVRecord[];
    
    console.log("[CSV] Parsed records:", records.length);
    
    if (records.length === 0) {
      // Try parsing without headers
      return parseCSVWithoutHeaders(text);
    }
    
    // Map CSV columns to transaction fields
    return records.map((record, index) => {
      const tx = mapCSVRecordToTransaction(record);
      if (!tx) {
        console.log(`[CSV] Skipping record ${index}:`, record);
        return null;
      }
      return tx;
    }).filter((tx): tx is ParsedTransaction => tx !== null);
    
  } catch (error) {
    console.error("[CSV] Parse error:", error);
    // Fallback to line-by-line parsing
    return parseText(text);
  }
}

/**
 * Parse CSV without headers - assumes standard format: date, description, amount
 */
function parseCSVWithoutHeaders(text: string): ParsedTransaction[] {
  try {
    const records = csvParse(text, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    }) as string[][];
    
    return records.map((row, index) => {
      if (row.length < 2) return null;
      
      // Try to identify date, description, amount from columns
      let date: Date | null = null;
      let description = "";
      let amount = 0;
      
      for (const cell of row) {
        if (!date) {
          const parsedDate = tryParseDate(cell);
          if (parsedDate) {
            date = parsedDate;
            continue;
          }
        }
        
        const parsedAmount = tryParseAmount(cell);
        if (parsedAmount !== null && amount === 0) {
          amount = parsedAmount;
          continue;
        }
        
        // Assume remaining text is description
        if (cell && cell.length > 2 && !description) {
          description = cell;
        }
      }
      
      if (!description || (amount === 0 && !date)) {
        return null;
      }
      
      return {
        date: date || new Date(),
        description,
        amount,
        confidence: 0.7
      };
    }).filter((tx): tx is ParsedTransaction => tx !== null);
    
  } catch (error) {
    console.error("[CSV] Headerless parse error:", error);
    return [];
  }
}

/**
 * Map a CSV record (with headers) to a transaction
 */
function mapCSVRecordToTransaction(record: CSVRecord): ParsedTransaction | null {
  // Common column name variations
  const dateKeys = ["date", "transaction date", "txn date", "trans_date", "posting date", "value date", "transaction_date"];
  const descKeys = ["description", "desc", "narrative", "particulars", "details", "merchant", "payee", "memo", "transaction_description"];
  const amountKeys = ["amount", "amt", "value", "transaction amount", "debit", "credit", "withdrawal", "deposit", "transaction_amount"];
  const categoryKeys = ["category", "type", "transaction type", "trans_type"];
  const balanceKeys = ["balance", "running balance", "available balance", "closing balance"];
  
  // Find matching columns (case-insensitive)
  const findValue = (keys: string[]): string | undefined => {
    for (const key of keys) {
      for (const recordKey of Object.keys(record)) {
        if (recordKey.toLowerCase().trim() === key.toLowerCase()) {
          return record[recordKey];
        }
      }
    }
    return undefined;
  };
  
  const dateStr = findValue(dateKeys);
  const description = findValue(descKeys);
  const amountStr = findValue(amountKeys);
  const category = findValue(categoryKeys);
  const balanceStr = findValue(balanceKeys);
  
  // Also check for separate debit/credit columns
  const debitStr = findValue(["debit", "withdrawal", "dr", "debit amount"]);
  const creditStr = findValue(["credit", "deposit", "cr", "credit amount"]);
  
  if (!description && !amountStr && !debitStr && !creditStr) {
    return null;
  }
  
  // Parse date
  let date = new Date();
  if (dateStr) {
    const parsedDate = tryParseDate(dateStr);
    if (parsedDate) date = parsedDate;
  }
  
  // Parse amount
  let amount = 0;
  if (amountStr) {
    amount = tryParseAmount(amountStr) || 0;
  } else if (debitStr || creditStr) {
    const debit = tryParseAmount(debitStr || "") || 0;
    const credit = tryParseAmount(creditStr || "") || 0;
    amount = credit - debit; // Credits positive, debits negative
  }
  
  // Parse balance
  let balance: number | undefined;
  if (balanceStr) {
    balance = tryParseAmount(balanceStr) || undefined;
  }
  
  return {
    date,
    description: description || "Unknown Transaction",
    amount,
    category: category || undefined,
    balance,
    confidence: 0.85
  };
}

/**
 * Parse plain text and extract transactions line by line
 */
function parseText(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const transactions: ParsedTransaction[] = [];
  
  // Check if it's structured format (Date:, Description:, Amount:)
  if (isStructuredFormat(text)) {
    return parseStructuredText(text);
  }
  
  // Check for common bank statement patterns
  for (const line of lines) {
    // Skip header lines
    if (isHeaderLine(line)) continue;
    
    const tx = parseTransactionLine(line);
    if (tx) {
      transactions.push(tx);
    }
  }
  
  return transactions;
}

/**
 * Check if text uses labeled format (Date:, Description:, Amount:)
 */
function isStructuredFormat(text: string): boolean {
  const hasDate = /\bdate\s*:/i.test(text);
  const hasDesc = /\bdescription\s*:/i.test(text);
  const hasAmount = /\bamount\s*:/i.test(text);
  return (hasDate && hasDesc) || (hasDate && hasAmount) || (hasDesc && hasAmount);
}

/**
 * Parse structured text with labeled fields
 */
function parseStructuredText(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const blocks: string[] = [];
  let currentBlock = "";
  
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentBlock.trim()) {
        blocks.push(currentBlock.trim());
        currentBlock = "";
      }
      continue;
    }
    
    if (/^date\s*:/i.test(trimmed) && currentBlock.trim()) {
      blocks.push(currentBlock.trim());
      currentBlock = trimmed + "\n";
    } else {
      currentBlock += trimmed + "\n";
    }
  }
  
  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }
  
  for (const block of blocks) {
    const tx = parseStructuredBlock(block);
    if (tx) transactions.push(tx);
  }
  
  return transactions;
}

/**
 * Parse a structured block into a transaction
 */
function parseStructuredBlock(block: string): ParsedTransaction | null {
  let date = new Date();
  let description = "";
  let amount = 0;
  let balance: number | undefined;
  
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const dateMatch = trimmed.match(/^date\s*:\s*(.+)$/i);
    if (dateMatch) {
      const parsed = tryParseDate(dateMatch[1].trim());
      if (parsed) date = parsed;
      continue;
    }
    
    const descMatch = trimmed.match(/^description\s*:\s*(.+)$/i);
    if (descMatch) {
      description = descMatch[1].trim();
      continue;
    }
    
    const amountMatch = trimmed.match(/^amount\s*:\s*([+-]?\s*[\d,.]+)$/i);
    if (amountMatch) {
      amount = tryParseAmount(amountMatch[1]) || 0;
      continue;
    }
    
    const balanceMatch = trimmed.match(/^balance(?:\s+after\s+transaction)?\s*:\s*([+-]?\s*[\d,.]+)$/i);
    if (balanceMatch) {
      balance = tryParseAmount(balanceMatch[1]) || undefined;
    }
  }
  
  if (!description && amount === 0) return null;
  if (!description) description = "Transaction";
  
  return {
    date,
    description,
    amount,
    balance,
    category: categorizeByDescription(description),
    confidence: 0.85
  };
}

/**
 * Check if a line is likely a header
 */
function isHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  const headerPatterns = [
    /^date.*description.*amount/i,
    /^transaction.*date/i,
    /^sr\.?\s*no/i,
    /^s\.?\s*no/i,
    /^#.*date/i,
    /^particulars.*debit.*credit/i
  ];
  return headerPatterns.some(p => p.test(lower));
}

/**
 * Parse a single transaction line
 */
function parseTransactionLine(line: string): ParsedTransaction | null {
  let date: Date | null = null;
  let amount = 0;
  let description = line;
  
  // Extract date
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,                    // 2024-01-15
    /(\d{2}\/\d{2}\/\d{4})/,                  // 01/15/2024 or 15/01/2024
    /(\d{2}-\d{2}-\d{4})/,                    // 15-01-2024
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i  // 15 Jan 2024
  ];
  
  for (const pattern of datePatterns) {
    const match = line.match(pattern);
    if (match) {
      const parsed = tryParseDate(match[1]);
      if (parsed) {
        date = parsed;
        description = line.replace(match[0], "").trim();
        break;
      }
    }
  }
  
  // Extract amount
  const amountPatterns = [
    /([+-]?\s*₹?\s*[\d,]+\.?\d*)\s*$/,        // Amount at end
    /([+-]?\s*\$?\s*[\d,]+\.?\d*)\s*$/,       // Dollar amount at end
    /(?:DR|CR|DEBIT|CREDIT)\s*([+-]?\s*[\d,]+\.?\d*)/i  // DR/CR prefixed
  ];
  
  for (const pattern of amountPatterns) {
    const match = description.match(pattern);
    if (match) {
      const parsed = tryParseAmount(match[1]);
      if (parsed !== null && Math.abs(parsed) > 0) {
        amount = parsed;
        // Check for debit/credit indicators
        if (/DR|DEBIT|WITHDRAWAL/i.test(line)) {
          amount = -Math.abs(amount);
        } else if (/CR|CREDIT|DEPOSIT/i.test(line)) {
          amount = Math.abs(amount);
        }
        description = description.replace(match[0], "").trim();
        break;
      }
    }
  }
  
  // Clean description
  description = description
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  
  if (!description || description.length < 2) return null;
  if (!date) date = new Date();
  
  return {
    date,
    description,
    amount,
    category: categorizeByDescription(description),
    confidence: 0.7
  };
}

/**
 * Try to parse a date string in various formats
 */
function tryParseDate(str: string): Date | null {
  if (!str) return null;
  str = str.trim();
  
  // Standard date parsing
  let date = new Date(str);
  if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
    return date;
  }
  
  // "11 Dec 2025" format
  const dmy = str.match(/^(\d{1,2})\s+(\w{3,})\s+(\d{4})$/);
  if (dmy) {
    const monthMap: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
      nov: 10, november: 10, dec: 11, december: 11
    };
    const month = monthMap[dmy[2].toLowerCase()];
    if (month !== undefined) {
      date = new Date(parseInt(dmy[3]), month, parseInt(dmy[1]));
      if (!isNaN(date.getTime())) return date;
    }
  }
  
  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    // Assume DD/MM/YYYY format
    date = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    if (!isNaN(date.getTime())) return date;
  }
  
  // MM/DD/YYYY format
  const mmddyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mmddyyyy) {
    const m = parseInt(mmddyyyy[1]);
    const d = parseInt(mmddyyyy[2]);
    if (m <= 12 && d <= 31) {
      date = new Date(parseInt(mmddyyyy[3]), m - 1, d);
      if (!isNaN(date.getTime())) return date;
    }
  }
  
  return null;
}

/**
 * Try to parse an amount string
 */
function tryParseAmount(str: string): number | null {
  if (!str) return null;
  
  // Remove currency symbols and whitespace
  let cleaned = str.replace(/[₹$€£\s]/g, "").trim();
  
  // Handle negative indicators
  const isNegative = cleaned.startsWith("-") || cleaned.startsWith("(") || /DR|DEBIT/i.test(str);
  cleaned = cleaned.replace(/[()+-]/g, "");
  
  // Remove commas but keep decimal point
  cleaned = cleaned.replace(/,/g, "");
  
  const amount = parseFloat(cleaned);
  if (isNaN(amount)) return null;
  
  return isNegative ? -Math.abs(amount) : amount;
}

/**
 * Categorize transaction based on description
 */
function categorizeByDescription(description: string): string {
  const lower = description.toLowerCase();
  
  const categories: Record<string, string[]> = {
    "Food": ["coffee", "restaurant", "cafe", "grocery", "food", "pizza", "burger", "starbucks", "mcdonald", "lunch", "dinner", "breakfast", "swiggy", "zomato", "uber eats"],
    "Shopping": ["amazon", "shop", "store", "mall", "purchase", "buy", "ebay", "walmart", "target", "flipkart", "myntra"],
    "Transportation": ["gas", "fuel", "uber", "lyft", "taxi", "parking", "transit", "metro", "bus", "train", "ola", "rapido", "petrol"],
    "Entertainment": ["netflix", "spotify", "movie", "theater", "game", "steam", "playstation", "xbox", "hulu", "disney", "prime video"],
    "Bills": ["electric", "water", "internet", "phone", "insurance", "rent", "mortgage", "utility", "bill", "recharge", "broadband"],
    "Income": ["salary", "deposit", "payment received", "refund", "income", "paycheck", "direct deposit", "credited"],
    "Transfer": ["transfer", "wire", "crypto", "exchange", "atm", "withdrawal", "cash", "neft", "imps", "upi", "rtgs"],
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }
  
  return "Other";
}
