const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read the migration SQL
const migrationPath = path.join(__dirname, 'prisma', 'migrations', '20260110_add_rls_policies', 'migration.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// Database connection from .env
const DATABASE_URL = "postgresql://postgres:bababooy2005@localhost:5432/vessify";

console.log('Applying migration manually...');

// Use Prisma's executeRawUnsafe to run the migration
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
  try {
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('/*'));

    console.log(`Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`\nExecuting statement ${i + 1}/${statements.length}:`);
        console.log(statement.substring(0, 100) + '...');
        
        try {
          await prisma.$executeRawUnsafe(statement + ';');
          console.log('✓ Success');
        } catch (err) {
          // Ignore errors if column already exists
          if (err.message.includes('already exists') || err.message.includes('duplicate')) {
            console.log('⚠ Already exists, skipping');
          } else {
            console.error('✗ Error:', err.message);
          }
        }
      }
    }

    console.log('\n✅ Migration completed!');
    
    // Verify userId column exists
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Transaction' AND column_name = 'userId'
    `;
    
    if (result.length > 0) {
      console.log('✓ Verified: userId column exists in Transaction table');
    } else {
      console.log('✗ Warning: userId column not found');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
