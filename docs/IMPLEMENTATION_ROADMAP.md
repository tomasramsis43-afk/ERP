# Roadmap (remaining work, in priority order)

1. CI green on the branch (API + PostgreSQL). Merge only after that.
2. Finding A: purchase-cancel costing fix + reconciliation test.
3. Real-device test pass (Android first) and fix what it reveals.
4. Incremental sync with a server cursor; background sync; payload size limits.
5. Audit accounting posting, treasury, payroll, VAT, period closing; add integrity tests (debits = credits per entry,
   no double posting, immutable posted entries).
6. IDOR / isolation tests per role; Branch model if needed; dependency scan; Redis-backed throttling for multi-instance.
7. Performance tests at the target volumes (10k products, 20k customers, 50k movements, 100k journal lines).
8. Push notifications; mobile dark-mode polish and accessibility review on device.
9. Web: audit every form and table against the real API.
