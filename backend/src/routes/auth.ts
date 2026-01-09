import { Hono } from "hono";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { auth } from "../auth/better-auth";

const prisma = new PrismaClient();
export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const { email, password } = await c.req.json();

  const hash = await bcrypt.hash(password, 10);
  const org = await prisma.organization.create({
    data: { name: `${email}-org` }
  });

  const user = await prisma.user.create({
    data: { email, passwordHash: hash, organizationId: org.id }
  });

  const session = await auth.createSession({ userId: user.id });

  return c.json(session);
});

authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return c.text("Invalid credentials", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.text("Invalid credentials", 401);

  const session = await auth.createSession({ userId: user.id });
  return c.json(session);
});
