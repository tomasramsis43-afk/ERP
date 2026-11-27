# Mobile release notes

- Profiles (`apps/mobile/eas.json`): `development`, `preview` (APK, HTTP allowed for LAN servers), `production`
  (AAB, HTTPS-only, auto-increment build number). `app.config.js` reads `EAS_BUILD_PROFILE`.
- Before the first store build: set the final `android.package` / `ios.bundleIdentifier` in `app.json`, run `eas init`,
  create the Android keystore through EAS (never commit it), set `EXPO_TOKEN` in GitHub secrets.
- Server: the production API address in `app.json` (`extra.apiUrl`) must be HTTPS. A user can still type another HTTPS
  address on the login screen.
- Run CI (typecheck + tests) before every build; the APK job is manual (`workflow_dispatch`).
- Backend deployment, migrations, backup and rollback: see `docs/operations/runbook.md` (not changed in this pass).
