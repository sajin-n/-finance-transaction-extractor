# Vessify Full-Stack Assignment

A Hono + Prisma backend secured with Better Auth, paired with a Next.js + NextAuth client for transaction extraction and listing. The backend exposes REST endpoints for auth and transactions; the frontend consumes them with credential-based login.

## Environment
- Copy `.env.example` to your local files:
  - `backend/.env` (backend variables)
  - `frontend/.env.local` (frontend/NextAuth variables)
- Fill in real values for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXTAUTH_SECRET`. Leave `PORT` empty in production so Render injects it.
- Backend defaults assume the API runs on `http://localhost:3000`; the frontend dev server runs on `http://localhost:3001` to avoid port clashes.

## Quickstart
### Backend (Hono + Prisma)
```bash
cd backend
npm install
npx prisma migrate dev           # applies migrations locally
npx prisma generate              # ensure client is generated
npm run dev                      # starts on http://localhost:3000
# Production: npm run build && npm run start
```

### Frontend (Next.js 16 + NextAuth)
```bash
cd frontend
npm install
# Runs on 3001 so it can talk to the API on 3000
npm run dev -- --port 3001
# Production: npm run build && npm start
```

## Seed data & test users
Seed the database after migrations so you get two orgs and users:
```bash
cd backend
npx ts-node seed.ts
```
Test accounts (email/password):
- Org: **Acme Analytics** — `alice@acme.test` / `Password123!`
- Org: **Nova Finance** — `bob@nova.test` / `Password123!`

## Running tests
- Backend: `cd backend && npm test`
- Frontend lint: `cd frontend && npm run lint`

## Better Auth integration (approach)
Better Auth runs with the Prisma adapter to keep auth state in Postgres while Hono handles the API layer. A relaxed CSRF/origin config is used for local server-to-server calls; in production you can tighten `trustedOrigins`. NextAuth consumes the Better Auth credential flow by exchanging credentials for a JWT, storing it as `accessToken` on the session for API isolation per organization/user.

## Deployment notes (Render)
- Service type: Web Service, root: `backend`, runtime: Node.
- Build: `npm install && npm run build && npx prisma migrate deploy` (or include generate in postinstall).
- Start: `npm run start` (listens on `process.env.PORT || 3000`).
- Env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your public API URL), `NEXTAUTH_SECRET`, plus any third-party keys.
- Prisma migrations are committed under `backend/prisma/migrations`.

## Frontend <> backend wiring
- API base is currently `http://localhost:3000` (see `frontend/src/lib/api.ts`). If you deploy the API elsewhere, update that base or add `NEXT_PUBLIC_BACKEND_URL` and wire it in.
- CORS is open for `localhost:3000/3001` for local development; set your production frontend origin in the backend CORS whitelist.
