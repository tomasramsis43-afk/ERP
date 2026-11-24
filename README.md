# ERP System

ERP for a distribution company: accounting, inventory, sales, purchases, treasury, representatives, vehicles, and an offline-capable representative mobile app. Base currency: EGP. UI languages: Arabic (RTL) and English.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Monorepo, Docker, DB schema (identity, accounting core), accounting engine | Implemented |
| 2 | Auth (JWT + rotating refresh), RBAC, audit log, users API, seed | Implemented, verified by CI only (see below) |
| 3–12 | Accounting UI/API, inventory, sales/purchases, treasury, representatives, mobile, offline sync, reports, hardening | Not started |

Nothing beyond phases 1–2 exists yet. Web and mobile apps have not been created.

## Stack
TypeScript, NestJS, PostgreSQL 16, Prisma, decimal.js, Redis (planned), Next.js (planned), Expo (planned). See `docs/architecture/0001-technology-decisions.md`.

## Requirements
Node 20+, Docker (for PostgreSQL/Redis).

## Setup
```bash
cp .env.example .env          # then replace every CHANGE_ME value
npm install
npm run db:up                  # PostgreSQL + Redis
npm run build --workspace @erp/shared-types --workspace @erp/accounting-engine
cd apps/api
npx prisma generate
npx prisma migrate dev --name init   # creates the first migration from schema.prisma
npm run prisma:seed            # roles, permissions, EGP, chart of accounts, admin user
npm run start:dev              # http://localhost:3001/api/docs
```

## Tests
```bash
npm run typecheck && npm test
```

## Layout
```
apps/api            NestJS API (auth, users, audit; more modules per phase)
packages/shared-types       permission codes and roles shared by all apps
packages/accounting-engine  decimal money + journal validation
infrastructure, database, docs, tests, .github
```
