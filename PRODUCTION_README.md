# Vessify Personal Finance Transaction Extractor

Production-grade multi-tenant transaction parser with end-to-end security, proper auth/isolation, and scalable architecture.

## 🎯 Features

✅ **Secure Multi-Tenancy** — Every user is isolated at auth, application, and database (RLS) layers  
✅ **Bank Statement Parsing** — Handles 3+ text formats with ML-style confidence scoring  
✅ **Better Auth Integration** — Email/password with JWT, hashed passwords, session management  
✅ **Protected APIs** — Middleware enforces auth; all queries filter by `organizationId` + `userId`  
✅ **PostgreSQL RLS** — Row-Level Security policies prevent even SQL injection attacks  
✅ **Cursor Pagination** — Scalable infinite scroll with indexed queries  
✅ **TypeScript & Jest** — Full type safety + 6+ unit tests covering auth/isolation/parsing  
✅ **Next.js + shadcn/ui** — Modern frontend with Tailwind styling  

---

## 🔧 Tech Stack

| Layer | Tech |
|-------|------|
| Backend | **Hono** (TypeScript) |
| Database | **PostgreSQL** + **Prisma ORM** |
| Auth (Backend) | **Better Auth** (JWT + sessions) |
| Auth (Frontend) | **NextAuth.js** (Credentials provider) |
| Frontend | **Next.js 15 App Router** (TypeScript) |
| UI | **shadcn/ui** + **Tailwind CSS** |
| Testing | **Jest** + **Playwright** (E2E) |

---

## 📋 Supported Formats

The extractor handles three real-world formats:

### Format 1: Structured
```
Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50
```

### Format 2: Compact
```
Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50
```

### Format 3: Messy
```
txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Clone & Install

```bash
git clone <repo>
cd vessify-assignment-FTE

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Setup Environment

**Backend** — `backend/.env`
```env
DATABASE_URL=postgresql://user:password@localhost:5432/vessify
BETTER_AUTH_SECRET=your-64-char-hex-secret-here
PORT=3000
NODE_ENV=development
```

**Frontend** — `frontend/.env.local`
```env
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Setup Database

```bash
cd backend
npx prisma migrate deploy  # Apply migrations (incl. RLS policies)
npx prisma db seed         # Create test user
```

This will:
- Create tables (User, Organization, Transaction, etc.)
- Enable PostgreSQL RLS with `current_user_id()` policies
- Create test user: `test@example.com` / `password123`

### 4. Run Servers

**Terminal 1 — Backend**
```bash
cd backend
npm run dev
# Backend running on http://localhost:3000
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
# Frontend running on http://localhost:3001
```

### 5. Test the App

1. Open **http://localhost:3001/login**
2. Sign in with:
   - **Email:** `test@example.com`
   - **Password:** `password123`
3. You'll be redirected to **/** (home)
4. Paste one of the sample texts above into the textarea
5. Click **"Parse & Save"**
6. View transactions in the paginated table below

---

## 🔐 Security & Isolation

### Authentication Flow
```
User Login
    ↓
NextAuth Credentials Provider
    ↓
Backend POST /api/auth/custom-sign-in
    ↓
Better Auth validates email + password (bcrypt)
    ↓
JWT signed with BETTER_AUTH_SECRET (7-day expiry)
    ↓
Frontend stores in NextAuth session
    ↓
All API requests include Bearer token
```

### Multi-Tenancy Enforcement (3 layers)

**Layer 1: Middleware**
```typescript
const { organizationId, userId } = c.get("auth");
// JWT is decoded, user is fetched from DB with their org
```

**Layer 2: Application**
```typescript
// All queries filter by organizationId + userId
const txs = await prisma.transaction.findMany({
  where: { organizationId, userId }
});
```

**Layer 3: Database (PostgreSQL RLS)**
```sql
CREATE POLICY "Users can view own transactions" ON "Transaction"
FOR SELECT USING ("userId" = current_user_id());
```

### Data Isolation Test
Run Jest to verify no data leakage:
```bash
npm test -- transactions.test.ts
```
Tests confirm:
- User A cannot see User B's transactions
- Pagination doesn't leak data across orgs
- Queries enforce `organizationId + userId`

---

## 🧪 Testing

### Unit Tests (Jest)
```bash
cd backend
npm test                  # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

**Test Coverage:**
- ✅ Auth middleware (JWT validation, org injection)
- ✅ Data isolation (multi-org, per-user filtering)
- ✅ Transaction extraction (3 formats)
- ✅ Confidence scoring
- ✅ Pagination without data leakage

### E2E Tests (Playwright)
```bash
cd frontend
npm install -D @playwright/test
npm run test:e2e
```

Tests include:
- Login flow
- Transaction extraction
- Pagination
- Data isolation (User A can't access User B's data)

---

## 📊 API Reference

### Authentication

**POST /api/auth/custom-sign-in**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
Returns:
```json
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Transactions

**POST /api/transactions/extract** (Protected)
```json
{
  "text": "Date: 11 Dec 2025\nDescription: STARBUCKS\nAmount: -420.00"
}
```
Returns:
```json
{
  "id": "...",
  "date": "2025-12-11T00:00:00Z",
  "description": "STARBUCKS",
  "amount": -420,
  "confidence": 0.95,
  "organizationId": "...",
  "userId": "..."
}
```

**GET /api/transactions?cursor=...** (Protected)
```json
{
  "data": [
    { "id": "...", "date": "...", "description": "...", "amount": -420, "confidence": 0.95 }
  ],
  "nextCursor": "..." // or null
}
```

---

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── app.ts              # Hono app + routes setup
│   ├── server.ts           # Server entry point
│   ├── prisma.ts           # Prisma client
│   ├── auth/
│   │   ├── better-auth.ts  # Better Auth config
│   │   ├── middleware.ts   # JWT + org injection ✅ TEST
│   │   └── middleware.test.ts
│   ├── routes/
│   │   ├── auth.ts         # Auth routes
│   │   ├── transactions.ts # Transaction endpoints
│   │   └── transactions.test.ts ✅ TEST (isolation + pagination)
│   ├── services/
│   │   ├── extractor.ts    # Text parsing logic
│   │   └── extractor.test.ts ✅ TEST (3 formats)
│   ├── utils/
│   │   └── confidence.ts   # Confidence scoring
│   └── types/
│       └── env.ts
├── prisma/
│   ├── schema.prisma       # DB schema + RLS
│   └── migrations/
│       ├── 20260109...init/
│       ├── 20260109...better_auth/
│       ├── 20260109...consolidate/
│       └── 20260110...rls/ ✅ NEW (RLS policies)
├── jest.config.json        # Jest config
├── package.json            # Dependencies + test scripts
└── .env                    # Database URL + secret

frontend/
├── app/
│   ├── layout.tsx          # Root layout + auth provider
│   ├── page.tsx            # Protected home page
│   ├── login/page.tsx      # Login form
│   ├── signup/page.tsx     # Signup form
│   ├── transactions-client.tsx # Transaction UI
│   └── api/auth/[...nextauth]/route.ts # NextAuth config
├── src/
│   ├── lib/
│   │   ├── api.ts          # Axios client + token injection
│   │   └── utils.ts
│   ├── components/ui/      # shadcn/ui components
│   └── types/
│       └── transaction.ts
└── package.json
```

---

## 🚢 Deployment

### Frontend → Vercel

```bash
cd frontend
npm install -g vercel
vercel
# Follow prompts; will ask for env vars
```

Set env vars in Vercel dashboard:
- `NEXTAUTH_SECRET` → Generate: `openssl rand -hex 32`
- `NEXTAUTH_URL` → `https://your-app.vercel.app`
- `NEXT_PUBLIC_API_URL` → Backend URL (Railway/Render)

### Backend → Railway

1. **Connect GitHub repo**
   - Go to Railway → New Project → GitHub Repo
   - Select this repo

2. **Add PostgreSQL plugin**
   - Railway will auto-inject `DATABASE_URL`

3. **Set env vars**
   - `BETTER_AUTH_SECRET` → Generate: `openssl rand -hex 32`
   - `PORT` → `3000` (Railway default)
   - `NODE_ENV` → `production`

4. **Deploy**
   - Push to main branch; Railway auto-deploys
   - Logs visible in Railway dashboard

---

## 📈 Performance & Scalability

### Indexes
```sql
-- Query transactions by user + date
CREATE INDEX idx_tx_user_created ON "Transaction"("userId", "createdAt");

-- Cursor-based pagination
CREATE INDEX idx_tx_id_org ON "Transaction"("id", "organizationId");
```

### Cursor Pagination
Avoids OFFSET (scales to millions of records):
```typescript
// First page
const txs = await prisma.transaction.findMany({
  where: { organizationId },
  take: 10,
  orderBy: { createdAt: "desc" }
});

// Next page
const txs = await prisma.transaction.findMany({
  where: { organizationId },
  take: 10,
  cursor: { id: lastTransactionId },
  skip: 1,
  orderBy: { createdAt: "desc" }
});
```

### RLS Query Performance
PostgreSQL RLS adds minimal overhead (~1-2%); provides security without application logic.

---

## 🐛 Troubleshooting

### Port 3000 already in use (Windows)
```bash
# Updated nodemon config sends SIGINT to clean exit
npm run dev
# If still stuck:
netstat -ano | grep 3000
cmd.exe /c taskkill /PID <PID> /F
```

### Migrations fail
```bash
cd backend
npx prisma migrate dev --name fix_schema
npx prisma generate
```

### Tests fail due to DATABASE_URL
```bash
# Ensure .env is loaded
source .env  # or set DATABASE_URL manually
npm test
```

### E2E tests timeout
Playwright may need browser install:
```bash
npx playwright install
npm run test:e2e
```

---

## 🎓 What This Demonstrates

✅ **Production-grade auth** — Better Auth + JWT + sessions  
✅ **True multi-tenancy** — Org isolation at 3 layers (middleware, ORM, database)  
✅ **Security best practices** — Password hashing, RLS policies, protected endpoints  
✅ **Scalable architecture** — Cursor pagination, indexed queries, no N+1 bugs  
✅ **Full-stack TypeScript** — Type-safe end-to-end  
✅ **Testing culture** — Jest + Playwright E2E  
✅ **DevOps ready** — Docker support, environment config, CI/CD compatible  

---

## 📄 License

MIT

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Write tests for new code
4. Submit a pull request

---

## 📧 Support

For issues or questions:
- Check the troubleshooting section above
- Open a GitHub issue with logs
- DM on Twitter [@VessifyApp](https://twitter.com/VessifyApp)

---

**Built with ❤️ at Vessify — Secure finance for the modern web**
