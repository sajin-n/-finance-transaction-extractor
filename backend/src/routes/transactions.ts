import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { extractTransaction } from "../services/extractor";
import { requireAuth } from "../auth/middleware";

const prisma = new PrismaClient();
export const txRoutes = new Hono();

txRoutes.post("/extract", requireAuth, async (c) => {
  const { text } = await c.req.json();
  const user = c.get("user");

  const parsed = extractTransaction(text);

  const tx = await prisma.transaction.create({
    data: {
      ...parsed,
      confidence: 0.9,
      organizationId: user.organizationId
    }
  });

  return c.json(tx);
});

txRoutes.get("/", requireAuth, async (c) => {
  const cursor = c.req.query("cursor");
  const user = c.get("user");

  const txs = await prisma.transaction.findMany({
    where: { organizationId: user.organizationId },
    take: 10,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { createdAt: "desc" }
  });

  return c.json(txs);
});
