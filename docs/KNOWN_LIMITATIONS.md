# Known limitations

- Not verified on a real device: camera scanner, SQLite transactions under crash, PDF Arabic shaping, RTL layout, sync.
- Pull is a full snapshot; large catalogues are slow to sync. No OS-level background sync.
- Push notifications not implemented (needs credentials and a token endpoint).
- No Branch model, so no branch isolation. Throttling is per-instance (no Redis).
- Purchase cancellation can leave stock valuation and ledger inventory different (finding A).
- Local van stock is an estimate between syncs; the server decides.
- Server-side Arabic PDF reports, FIFO, batch/expiry management and recurring entries are not implemented (see README).
- Accounting, treasury, HR/payroll, VAT, reports, web screens and migrations were not audited in this pass.
- Application id `com.erpfield.app` is a placeholder; set the company's own id before the first release.
