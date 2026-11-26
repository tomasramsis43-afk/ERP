# Operations runbook

## Environment
All secrets come from environment variables (`.env.example` lists them with placeholders). Never commit `.env`.

## Deploy
`docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file .env up -d --build`. The API runs `prisma migrate deploy` and the idempotent seed on start. CI fails when `schema.prisma` and the migrations disagree, so a new schema change needs a new migration folder (`npx prisma migrate dev --name <change>` locally).

## Backup
```bash
DATABASE_URL=postgresql://user:pw@host:5432/erp infrastructure/scripts/backup.sh /var/backups/erp 14
```
Writes a compressed dump, verifies the archive is readable, and prunes dumps older than 14 days. Schedule it (cron/systemd timer) at least daily and copy dumps off the server. Use client tools of the same major version as the server (16).

## Verify a backup (do this regularly)
```bash
ADMIN_DATABASE_URL=postgresql://user:pw@host:5432/postgres infrastructure/scripts/verify-backup.sh /var/backups/erp/erp-<timestamp>.dump
```
Restores into a throwaway database and checks posted journals balance.

## Restore
```bash
DATABASE_URL=postgresql://user:pw@host:5432/erp infrastructure/scripts/restore.sh <file.dump> --yes-replace-everything
```
This replaces the target database's contents. Stop the API first.

## Security checklist
- Replace every `CHANGE_ME`; use long random JWT secrets; change the seeded admin password after first login.
- Terminate TLS in front of the web container; do not publish PostgreSQL or Redis.
- Tokens: access tokens are short-lived; refresh tokens rotate and are stored hashed; web sessions use httpOnly cookies.
- The audit log is append-only at the database level.
