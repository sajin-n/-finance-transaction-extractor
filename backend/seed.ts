import { prisma } from "./src/prisma";
import { hashPassword } from "better-auth/crypto";

async function seed() {
  console.log("[SEED] Seeding organizations and users...");

  const organizations = [
    { id: "org-acme", name: "Acme Analytics" },
    { id: "org-nova", name: "Nova Finance" }
  ];

  const users = [
    {
      id: "user-alice",
      email: "alice@acme.test",
      name: "Alice Acme",
      orgId: "org-acme",
      accountId: "acc-alice",
      password: "Password123!"
    },
    {
      id: "user-bob",
      email: "bob@nova.test",
      name: "Bob Nova",
      orgId: "org-nova",
      accountId: "acc-bob",
      password: "Password123!"
    }
  ];

  try {
    // Upsert organizations
    for (const org of organizations) {
      await prisma.organization.upsert({
        where: { id: org.id },
        update: { name: org.name },
        create: { id: org.id, name: org.name }
      });
      console.log(`[SEED] Organization ensured: ${org.name}`);
    }

    // Upsert users + accounts
    for (const user of users) {
      const hashedPassword = await hashPassword(user.password);
      const now = new Date();

      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          organization: { connect: { id: user.orgId } },
          accounts: {
            upsert: {
              where: { id: user.accountId },
              update: {
                accountId: user.accountId,
                providerId: "email",
                password: hashedPassword,
                updatedAt: now
              },
              create: {
                id: user.accountId,
                accountId: user.accountId,
                providerId: "email",
                password: hashedPassword,
                createdAt: now,
                updatedAt: now
              }
            }
          }
        },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: true,
          organization: { connect: { id: user.orgId } },
          createdAt: now,
          updatedAt: now,
          accounts: {
            create: {
              id: user.accountId,
              accountId: user.accountId,
              providerId: "email",
              password: hashedPassword,
              createdAt: now,
              updatedAt: now
            }
          }
        }
      });

      console.log(`[SEED] User ensured: ${user.email}`);
    }
  } catch (error: any) {
    console.error("[SEED] Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed().then(() => {
  console.log("[SEED] Done");
  process.exit(0);
});
