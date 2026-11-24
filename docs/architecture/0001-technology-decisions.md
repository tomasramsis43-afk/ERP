# ADR 0001 — Technology decisions

Status: accepted

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | One language across API, web, mobile and shared packages |
| Monorepo | npm workspaces | No extra tooling; shared packages consumed as workspace deps |
| API | NestJS 10 | Modules, guards, DI map directly to the module-per-domain requirement |
| Database | PostgreSQL 16 | Transactions, `NUMERIC` for money, triggers for immutability |
| ORM | Prisma 5 | Typed queries, migrations; money columns are `Decimal(18,2)` |
| Money | decimal.js in `@erp/accounting-engine` | No floating point anywhere in accounting math |
| Web (planned) | Next.js + React | RTL/i18n (ar/en), dark mode |
| Mobile (planned) | Expo / React Native + SQLite | Offline queue with idempotency keys |
| Cache/jobs (planned) | Redis | Rate limiting, background jobs |

## Accounting invariants
1. Every journal goes through `validateJournal` (balanced, no negative, one side per line).
2. Posted entries and their lines are immutable at database level (triggers in `apps/api/prisma/sql/immutability.sql`); corrections are reversal entries (`reversesId`).
3. `JournalEntry.idempotencyKey` is unique, so a retried or offline-synced operation cannot post twice.
4. `AuditLog` is append-only (trigger).

## Defaults
Base currency EGP; Arabic default locale with English supported; VAT disabled by default (setting `vat.enabled`, 14% rate when enabled).
