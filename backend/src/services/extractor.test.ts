import { describe, it, expect } from "@jest/globals";
import { extractTransaction } from "./extractor";
import { calculateConfidence } from "../utils/confidence";

/**
 * Transaction Extraction Tests
 * - Validates parsing of three sample formats
 * - Tests confidence scoring
 * - Confirms data structure integrity
 */

describe("Transaction Extraction Service", () => {
  const samples = [
    {
      name: "Sample 1: Starbucks",
      text: `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`,
      expected: {
        hasDate: true,
        hasDescription: true,
        hasAmount: true,
        amountValue: -420
      }
    },
    {
      name: "Sample 2: Uber",
      text: `Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50`,
      expected: {
        hasDate: true,
        hasDescription: true,
        hasAmount: true,
        amountValue: -1250
      }
    },
    {
      name: "Sample 3: Amazon (messy)",
      text: `txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`,
      expected: {
        hasDate: true,
        hasDescription: true,
        hasAmount: true,
        amountValue: -2999
      }
    }
  ];

  samples.forEach(({ name, text, expected }) => {
    it(`should extract transaction from ${name}`, () => {
      const result = extractTransaction(text);

      expect(result).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.description.length).toBeGreaterThan(0);
      expect(result.amount).toBeDefined();
    });

    it(`should calculate high confidence for ${name}`, () => {
      const confidence = calculateConfidence(text);

      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  it("should return low confidence for minimal text", () => {
    const text = "pay";
    const confidence = calculateConfidence(text);

    expect(confidence).toBeLessThan(0.3);
  });

  it("should return 0 confidence for empty text", () => {
    const text = "";
    const confidence = calculateConfidence(text);

    expect(confidence).toBe(0);
  });

  it("should handle text with multiple dates and amounts", () => {
    const text = `
      Previous Balance: 20,000
      Date: 10 Dec 2025
      Starbucks: -200
      Date: 11 Dec 2025
      Groceries: -1,500
    `;
    const result = extractTransaction(text);

    expect(result).toBeDefined();
    expect(result.description).toBeDefined();
  });

  it("should normalize amount signs correctly", () => {
    const creditText = `
      Amount: +500
      Date: 2025-12-11
      Salary deposit
    `;
    const debitText = `
      Amount: -500
      Date: 2025-12-11
      Bill payment
    `;

    const creditTx = extractTransaction(creditText);
    const debitTx = extractTransaction(debitText);

    expect(creditTx.amount).toBeGreaterThan(0);
    expect(debitTx.amount).toBeLessThan(0);
  });
});
