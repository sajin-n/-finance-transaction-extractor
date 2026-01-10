const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('Step 1: Adding userId column...');
    await prisma.$executeRaw`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "userId" TEXT`;
    
    console.log('Step 2: Backfilling userId from organization relationships...');
    // For each transaction, find a user in the same organization and assign it
    await prisma.$executeRaw`
      UPDATE "Transaction" t
      SET "userId" = (
        SELECT u.id 
        FROM "User" u 
        WHERE u."organizationId" = t."organizationId" 
        LIMIT 1
      )
      WHERE t."userId" IS NULL
    `;
    
    console.log('Step 3: Making userId NOT NULL...');
    await prisma.$executeRaw`ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL`;
    
    console.log('Step 4: Adding foreign key constraint...');
    await prisma.$executeRaw`
      ALTER TABLE "Transaction" 
      ADD CONSTRAINT "Transaction_userId_fkey" 
      FOREIGN KEY ("userId") 
      REFERENCES "User"("id") 
      ON DELETE CASCADE
    `;
    
    console.log('Step 5: Creating index...');
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Transaction_userId_idx" ON "Transaction"("userId")`;
    
    console.log('Step 6: Enabling Row Level Security...');
    await prisma.$executeRaw`ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY`;
    
    console.log('Step 7: Creating current_user_id function...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION current_user_id() RETURNS TEXT AS $$
      BEGIN
        RETURN current_setting('app.current_user_id', true);
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('Step 8: Creating RLS policies...');
    
    // Drop existing policies if they exist
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can view own transactions" ON "Transaction"`);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can insert own transactions" ON "Transaction"`);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can update own transactions" ON "Transaction"`);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Users can delete own transactions" ON "Transaction"`);
    
    // Create new policies
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Users can view own transactions" ON "Transaction"
      FOR SELECT USING ("userId" = current_user_id())
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Users can insert own transactions" ON "Transaction"
      FOR INSERT WITH CHECK ("userId" = current_user_id())
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Users can update own transactions" ON "Transaction"
      FOR UPDATE USING ("userId" = current_user_id())
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Users can delete own transactions" ON "Transaction"
      FOR DELETE USING ("userId" = current_user_id())
    `);
    
    console.log('\n✅ Migration completed successfully!');
    
    // Verify
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Transaction' AND column_name = 'userId'
    `;
    
    if (result.length > 0) {
      console.log('✓ Verified: userId column exists in Transaction table');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
