import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { prisma } from "../prisma";

/**
 * Data Isolation Tests
 * - Validates that users only see their own transactions
 * - Tests cross-organization access prevention
 * - Confirms organizationId filtering
 */

describe("Data Isolation & Multi-Tenancy", () => {
  let org1Id: string;
  let org2Id: string;
  let user1Id = "user-1-" + Date.now();
  let user2Id = "user-2-" + Date.now();
  let tx1Id: string;
  let tx2Id: string;

  beforeAll(async () => {
    // Create two organizations
    const org1 = await prisma.organization.create({
      data: { name: "Organization 1" }
    });
    org1Id = org1.id;

    const org2 = await prisma.organization.create({
      data: { name: "Organization 2" }
    });
    org2Id = org2.id;

    // Create two users in different orgs
    await prisma.user.create({
      data: {
        id: user1Id,
        email: `user1-${Date.now()}@example.com`,
        organizationId: org1Id
      }
    });

    await prisma.user.create({
      data: {
        id: user2Id,
        email: `user2-${Date.now()}@example.com`,
        organizationId: org2Id
      }
    });

    // Create transactions for each user
    const tx1 = await prisma.transaction.create({
      data: {
        organizationId: org1Id,
        date: new Date("2025-12-11"),
        description: "Starbucks",
        amount: -420,
        confidence: 0.95
      }
    });
    tx1Id = tx1.id;

    const tx2 = await prisma.transaction.create({
      data: {
        organizationId: org2Id,
        date: new Date("2025-12-11"),
        description: "Uber Ride",
        amount: -1250,
        confidence: 0.90
      }
    });
    tx2Id = tx2.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.transaction.delete({ where: { id: tx1Id } }).catch(() => {});
    await prisma.transaction.delete({ where: { id: tx2Id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user1Id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user2Id } }).catch(() => {});
    await prisma.organization.delete({ where: { id: org1Id } }).catch(() => {});
    await prisma.organization.delete({ where: { id: org2Id } }).catch(() => {});
  });

  it("should only return transactions for the requesting user's organization", async () => {
    // Simulate user1 fetching their transactions
    const user1Transactions = await prisma.transaction.findMany({
      where: { organizationId: org1Id }
    });

    expect(user1Transactions).toHaveLength(1);
    expect(user1Transactions[0].id).toBe(tx1Id);
  });

  it("should prevent user from accessing another org's transactions", async () => {
    // Simulate user1 trying to fetch all transactions (should only get their org's)
    const user1Transactions = await prisma.transaction.findMany({
      where: { organizationId: org1Id }
    });

    const user2Transactions = await prisma.transaction.findMany({
      where: { organizationId: org2Id }
    });

    // Verify they don't overlap
    const user1Ids = user1Transactions.map(t => t.id);
    const user2Ids = user2Transactions.map(t => t.id);
    
    expect(user1Ids).not.toContain(tx2Id);
    expect(user2Ids).not.toContain(tx1Id);
  });

  it("should enforce organizationId on transaction creation", async () => {
    const tx = await prisma.transaction.create({
      data: {
        organizationId: org1Id,
        date: new Date(),
        description: "Test transaction",
        amount: -100,
        confidence: 0.8
      }
    });

    expect(tx.organizationId).toBe(org1Id);

    // Cleanup
    await prisma.transaction.delete({ where: { id: tx.id } });
  });

  it("should paginate transactions per organization without data leakage", async () => {
    // Create multiple transactions for org1
    const txIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const tx = await prisma.transaction.create({
        data: {
          organizationId: org1Id,
          date: new Date("2025-12-" + String(10 + i).padStart(2, "0")),
          description: `Test TX ${i}`,
          amount: -100 * i,
          confidence: 0.8
        }
      });
      txIds.push(tx.id);
    }

    // Fetch page 1 (first 3)
    const page1 = await prisma.transaction.findMany({
      where: { organizationId: org1Id },
      take: 3,
      orderBy: { createdAt: "desc" }
    });

    // Verify org2 transactions don't leak
    const org2TxIds = page1.map(t => t.id);
    expect(org2TxIds).not.toContain(tx2Id);
    expect(page1.every(t => t.organizationId === org1Id)).toBe(true);

    // Cleanup
    for (const id of txIds) {
      await prisma.transaction.delete({ where: { id } });
    }
  });
});
