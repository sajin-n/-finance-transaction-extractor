import { describe, expect, it } from "@jest/globals";
import { extractWithRegex } from "./ai-extractor";

describe("ai-extractor regex safeguards", () => {
  it("extracts a single structured transaction and ignores balance lines", () => {
    const text = `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`;

    const transactions = extractWithRegex(text, { singleTransactionMode: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0].description).toContain("STARBUCKS");
    expect(transactions[0].amount).toBe(-420);
  });

  it("does not create transactions from text lines without amount", () => {
    const text = `Transaction Statement
Account Number: 123456
Date: 2025-12-11
Description only line`;

    const transactions = extractWithRegex(text, { singleTransactionMode: false });

    expect(transactions).toHaveLength(0);
  });

  it("keeps only best single transaction for receipt-like text", () => {
    const text = `Receipt
Date: 2025-12-11
Description: Coffee Beans
Amount: 95.00
Description: GST
Amount: 5.00
Description: Total Amount Paid
Amount: 100.00`;

    const transactions = extractWithRegex(text, { singleTransactionMode: true });

    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(100);
  });

  it("returns all transactions when single mode is disabled", () => {
    const text = `2025-12-10 UBER -450.00
2025-12-11 SWIGGY -299.00
2025-12-12 SALARY +15000.00`;

    const transactions = extractWithRegex(text, { singleTransactionMode: false });

    expect(transactions.length).toBeGreaterThanOrEqual(3);
  });
});
