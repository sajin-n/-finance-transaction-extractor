/*
  Warnings:

  - Added the required column `userId` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;

-- Backfill userId from organization relationships
UPDATE "Transaction" t
SET "userId" = (
  SELECT u.id 
  FROM "User" u 
  WHERE u."organizationId" = t."organizationId" 
  LIMIT 1
);

-- Make userId non-null after backfill
ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Create index for queries
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
