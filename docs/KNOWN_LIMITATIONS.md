# Known limitations

- Not verified on a real device: camera scanner, SQLite transactions under crash, PDF Arabic shaping, RTL layout, sync.
- Pull is a full snapshot; large catalogues are slow to sync. No OS-level background sync.
- Push notifications not implemented (needs credentials and a token endpoint).
- Branch scoping and Redis throttling exist on main but were not audited here.
- Local van stock is an estimate between syncs; the server decides.
- See `STATUS_AND_GAPS.md` (main's current list) for server-side gaps; it supersedes the README for this.
- Accounting, treasury, HR/payroll, VAT, reports, web screens and migrations were not audited in this pass.
- Application id `com.erpfield.app` is a placeholder; set the company's own id before the first release.
