import { prisma } from "./src/prisma";
import { hashPassword } from "better-auth/crypto";

async function seed() {
  console.log("[SEED] Creating test user...");

  try {
    const hashedPassword = await hashPassword("password123");

    const user = await prisma.user.create({
      data: {
        id: "test-user-001",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: {
          create: {
            id: "test-account-001",
            accountId: "test-account-001",
            providerId: "email",
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      }
    });

    console.log("[SEED] User created:", user);
  } catch (error: any) {
    if (error.code === "P2002") {
      console.log("[SEED] User already exists");
    } else {
      console.error("[SEED] Error:", error.message);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

seed().then(() => {
  console.log("[SEED] Done");
  process.exit(0);
});
