/**
 * PII Masking Service
 * Handles GDPR/CCPA compliant data masking and redaction
 */

export interface PIIMaskingResult {
  maskedText: string;
  detectedPII: Array<{
    type: PIIType;
    original: string;
    masked: string;
    position: { start: number; end: number };
  }>;
  piiScore: number; // 0-100, higher = more PII detected
}

export type PIIType = 
  | "credit_card"
  | "bank_account"
  | "ssn"
  | "email"
  | "phone"
  | "name"
  | "address"
  | "ip_address"
  | "date_of_birth"
  | "passport"
  | "driver_license";

interface PIIPattern {
  type: PIIType;
  pattern: RegExp;
  mask: (match: string) => string;
  weight: number; // For PII score calculation
}

const PII_PATTERNS: PIIPattern[] = [
  {
    type: "credit_card",
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    mask: (match) => `****-****-****-${match.slice(-4)}`,
    weight: 25
  },
  {
    type: "bank_account",
    pattern: /\b[0-9]{8,17}\b(?=.*(?:account|acct|a\/c))/gi,
    mask: (match) => `*****${match.slice(-4)}`,
    weight: 20
  },
  {
    type: "ssn",
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    mask: () => "***-**-****",
    weight: 30
  },
  {
    type: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: (match) => {
      const [local, domain] = match.split("@");
      return `${local[0]}***@${domain}`;
    },
    weight: 10
  },
  {
    type: "phone",
    pattern: /\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    mask: (match) => `(***) ***-${match.slice(-4)}`,
    weight: 15
  },
  {
    type: "ip_address",
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    mask: () => "***.***.***.***",
    weight: 5
  },
  {
    type: "date_of_birth",
    pattern: /\b(?:0[1-9]|1[0-2])[-\/](?:0[1-9]|[12][0-9]|3[01])[-\/](?:19|20)\d{2}\b/g,
    mask: () => "**/**/****",
    weight: 10
  },
  {
    type: "passport",
    pattern: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
    mask: (match) => `${match[0]}*****${match.slice(-2)}`,
    weight: 20
  }
];

// Common name patterns (simplified)
const NAME_PATTERNS = [
  /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
];

/**
 * Mask PII in text
 */
export function maskPII(text: string, options?: {
  excludeTypes?: PIIType[];
  preserveFormat?: boolean;
}): PIIMaskingResult {
  const detectedPII: PIIMaskingResult["detectedPII"] = [];
  let maskedText = text;
  let totalWeight = 0;
  const maxWeight = 100;

  const excludeTypes = new Set(options?.excludeTypes || []);

  for (const pattern of PII_PATTERNS) {
    if (excludeTypes.has(pattern.type)) continue;

    const matches = text.matchAll(pattern.pattern);
    for (const match of matches) {
      if (match.index === undefined) continue;

      const original = match[0];
      const masked = pattern.mask(original);

      detectedPII.push({
        type: pattern.type,
        original,
        masked,
        position: { start: match.index, end: match.index + original.length }
      });

      totalWeight += pattern.weight;
    }
  }

  // Sort by position (descending) to replace from end to start
  detectedPII.sort((a, b) => b.position.start - a.position.start);

  // Apply masking
  for (const pii of detectedPII) {
    maskedText = 
      maskedText.slice(0, pii.position.start) + 
      pii.masked + 
      maskedText.slice(pii.position.end);
  }

  // Re-sort by position ascending for output
  detectedPII.sort((a, b) => a.position.start - b.position.start);

  return {
    maskedText,
    detectedPII,
    piiScore: Math.min(100, Math.round((totalWeight / maxWeight) * 100))
  };
}

/**
 * Check if text contains any PII
 */
export function containsPII(text: string): boolean {
  for (const pattern of PII_PATTERNS) {
    if (pattern.pattern.test(text)) {
      // Reset lastIndex for global regex
      pattern.pattern.lastIndex = 0;
      return true;
    }
    pattern.pattern.lastIndex = 0;
  }
  return false;
}

/**
 * Get PII types present in text
 */
export function detectPIITypes(text: string): PIIType[] {
  const types: PIIType[] = [];
  
  for (const pattern of PII_PATTERNS) {
    if (pattern.pattern.test(text)) {
      types.push(pattern.type);
    }
    pattern.pattern.lastIndex = 0;
  }
  
  return types;
}

/**
 * Mask transaction data for external sharing
 */
export function maskTransactionForExport(transaction: {
  description: string;
  counterparty?: string | null;
  notes?: string | null;
}): {
  description: string;
  counterparty: string | null;
  notes: string | null;
  piiDetected: boolean;
} {
  const descResult = maskPII(transaction.description);
  const counterpartyResult = transaction.counterparty ? maskPII(transaction.counterparty) : null;
  const notesResult = transaction.notes ? maskPII(transaction.notes) : null;

  return {
    description: descResult.maskedText,
    counterparty: counterpartyResult?.maskedText || null,
    notes: notesResult?.maskedText || null,
    piiDetected: descResult.piiScore > 0 || 
                 (counterpartyResult?.piiScore || 0) > 0 || 
                 (notesResult?.piiScore || 0) > 0
  };
}

/**
 * Generate a GDPR-compliant data export with masked sensitive fields
 */
export function prepareGDPRExport(
  transactions: Array<{
    id: string;
    amount: number;
    description: string;
    date: Date;
    category: string | null;
    counterparty?: string | null;
    notes?: string | null;
  }>,
  options?: {
    includeMaskedPII?: boolean;
    anonymizeAmounts?: boolean;
  }
): Array<{
  id: string;
  amount: number | string;
  description: string;
  date: Date;
  category: string | null;
  piiRemoved: boolean;
}> {
  return transactions.map(tx => {
    const masked = maskTransactionForExport(tx);
    
    return {
      id: tx.id,
      amount: options?.anonymizeAmounts ? "REDACTED" : tx.amount,
      description: masked.description,
      date: tx.date,
      category: tx.category,
      piiRemoved: masked.piiDetected
    };
  });
}

/**
 * Create a hashed identifier for a transaction (for analytics without PII)
 */
export function createAnonymousId(input: string): string {
  // Simple hash function (in production, use proper crypto)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `anon_${Math.abs(hash).toString(36)}`;
}

/**
 * Validate that a field doesn't contain PII before storage
 */
export function validateNoPII(
  field: string,
  fieldName: string
): { valid: boolean; error?: string; detectedTypes?: PIIType[] } {
  const types = detectPIITypes(field);
  
  if (types.length > 0) {
    return {
      valid: false,
      error: `Field "${fieldName}" contains potentially sensitive data (${types.join(", ")})`,
      detectedTypes: types
    };
  }
  
  return { valid: true };
}
