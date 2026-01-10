/*
  Warnings:

  - Added the required column `userId` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;

-- Backfill userId from organization relationships
UPDATE "Transaction" t
SET "userId" = u.id
FROM "User" u
WHERE u."organizationId" = t."organizationId"
LIMIT 1;

-- Make userId non-null after backfill
ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Create index for queries
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- Enable RLS on Transaction table
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own transactions
CREATE POLICY "Users can view own transactions" ON "Transaction"
FOR SELECT USING (
  "userId" = current_user_id()
);

-- Policy: Users can only insert their own transactions
CREATE POLICY "Users can insert own transactions" ON "Transaction"
FOR INSERT WITH CHECK (
  "userId" = current_user_id()
);

-- Policy: Users can only update their own transactions
CREATE POLICY "Users can update own transactions" ON "Transaction"
FOR UPDATE USING (
  "userId" = current_user_id()
);

-- Policy: Users can only delete their own transactions
CREATE POLICY "Users can delete own transactions" ON "Transaction"
FOR DELETE USING (
  "userId" = current_user_id()
);

-- Create function to get current user ID from JWT
CREATE OR REPLACE FUNCTION current_user_id() RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_user_id', true);
END;
$$ LANGUAGE plpgsql;
