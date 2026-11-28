# Mobile field app — Phase 1

The representative app (`apps/mobile`) now opens on a **Today** dashboard instead of the customer list, and uses one
visual language across every screen. This is Phase 1 of the field-app redesign; the field operations that the API
already supports (visits, expenses, new customers, statements, performance report) are Phase 2.

## What changed

- **Design system** (`src/screens/theme.ts`): warm cream background, deep green primary, dark CTA, 18–22 px cards,
  soft chips, and Cairo as the single font family.
- **Today dashboard** (`src/screens/TodayScreen.tsx`): greeting + date, sync/offline chip, today's sales hero card,
  collected / visits / returns stats, the big "new sale" action, quick actions, upcoming visits in route order, route
  progress, and the custody balance.
- **Customers** (`src/screens/CustomersScreen.tsx`): search by name/code/phone, filters (all, due, not visited,
  visited), balance and credit limit, visit status, one-tap sale and call.
- **New sale** (`src/screens/SaleScreen.tsx`): customer card with balance/limit, searchable customer picker, product
  rows with quantity steppers and remaining van stock, and a sticky footer with credit / cash confirmation.
- **Bottom navigation** (`src/components/BottomNav.tsx`): Today, Customers, a raised sale button, Collection, More.
- **More** (`src/screens/MoreScreen.tsx`): returns, van stock, day summary, close day, sync, language and sign-out.

## Data sources (all offline-first)

| Element | Source |
| --- | --- |
| Customers, balances, credit limits, route order | `GET /sync/pull` snapshot, stored in SQLite |
| Today's visits | `visitsToday` from the snapshot, stored under the `visitsToday` key |
| Today's sales, collections, returns | Local receipts (`receiptsForDate` + `summarizeDay`) |
| Pending operations | Local outbox (`status = 'PENDING'`) |
| Custody balance | Representative profile from the snapshot |

`visitsToday` was added to the stored snapshot keys; existing installations pick it up on their next successful sync,
and older snapshots simply read as an empty list. No schema migration is needed because snapshots are key/value JSON.

## Money and status rules

- All sums use the existing BigInt decimal helpers (`src/core/money.ts`); nothing passes through floating point.
- A customer is **paid** when the balance is zero or negative, **over limit** when the balance exceeds a non-zero
  credit limit, and **due** otherwise.
- The upcoming-visit list and the route progress use `routeSequence` from the server; customers without a sequence
  come last, ordered by code.

## Tests

`src/core/fieldDay.spec.ts` covers exact money addition, thousands grouping, customer status, route splitting and the
date helpers. `npm run typecheck --workspace @erp/mobile` and `npm test --workspace @erp/mobile` pass, and
`npx expo export --platform android` bundles successfully.

## Still to do

- Phase 2: visit logging, expenses, new customers, customer statement, performance report, collection allocation.
- Physical-device pass (touch targets, RTL, Cairo rendering on a low-end Android phone).
- The interactive design reference lives at `apps/mobile/prototype/phase1.html`.
