# Deploying on Neon (database) + Render (API and web)

Time: about 30 minutes, no server administration needed.

## 1. Database on Neon
1. Create an account at neon.tech and a new project (choose the region closest to your users).
2. Open the project dashboard, click **Connect**, turn **off** "Connection pooling", and copy the connection string.
   It looks like `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`.
   Keep it secret: it is the password to all your data.

## 2. API and web on Render
1. Push this repository to your GitHub account (already done if you are reading this there).
2. At render.com choose **New > Blueprint**, connect GitHub and select this repository. Render reads `render.yaml` and proposes two services: `erp-api` and `erp-web`.
3. Fill the values it asks for:
   - `DATABASE_URL`: the Neon string from step 1.
   - `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: your administrator login (use a strong password).
   - `API_URL`: leave empty for now.
4. Click **Apply**. Wait until `erp-api` shows **Live** (the first build takes several minutes; on start it creates the tables and the chart of accounts by itself).
5. Open `erp-api` and copy its address (for example `https://erp-api-xxxx.onrender.com`). Check `<address>/api/v1/health` shows `ok`.
6. Open `erp-web` > Environment, set `API_URL` to `<address>/api/v1`, and save. It redeploys.
7. Open the `erp-web` address, sign in with the administrator email and password.

## 3. Mobile app and desktop program
In the mobile app's login screen, type the API address (`https://erp-api-xxxx.onrender.com`). The desktop program opens the `erp-web` address.

## Good to know
- Render's free plan puts a service to sleep after 15 idle minutes; the next request waits about a minute. For real work use the paid Starter plan for `erp-api` (about 7 USD/month) so representatives can sync at any time. Neon's free plan also pauses an idle database and wakes it on demand.
- Backups: Neon keeps point-in-time history (length depends on the plan) and you can also run `infrastructure/scripts/backup.sh` against the Neon connection string. Do a backup before every update.
- Updating: when new code is pushed to GitHub, Render redeploys automatically and applies new database migrations on start.
