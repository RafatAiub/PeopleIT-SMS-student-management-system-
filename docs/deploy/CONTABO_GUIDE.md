# Hosting PeopleNIT SMS on a Contabo VPS

Written 2026-09-29. Contabo sells real VPSs with root access, so Docker works there. (The earlier cPanel host could not run Docker.) Check contabo.com for current plans and prices before you buy.

## 1. What to buy

| Choice | Recommendation | Why |
|---|---|---|
| Plan | **Cloud VPS 10** (about 3–4 vCPU, 8 GB RAM, 75 GB NVMe, about $5/month) to start. Move to VPS 20 when you have more than ~50 active schools. | The API, Redis, the proxy and the frontend fit easily in 8 GB. |
| Region | **Singapore** | Closest Contabo region to Bangladesh, so the lowest latency. |
| OS | **Ubuntu 24.04 LTS** | Long support; Docker's official packages cover it. |
| Extras | **Auto Backup** (about $1.85/month) | Daily server snapshots, if the disk or a bad deploy destroys data. |
| Storage | NVMe, not the larger plain SSD | Faster for Postgres and Redis. |

## 2. Recommended architecture (start simple)

```
                ┌──────────────────── Contabo VPS (Docker) ─────────────────────┐
 Browser ──443──▶ Caddy (HTTPS, automatic SSL, on-demand SSL for school domains) │
                │   ├── app.<domain>        → frontend (built static files)       │
                │   ├── api.<domain>        → api container (Node/Express, :3001) │
                │   └── any school domain   → frontend (public site mode)         │
                │ redis (BullMQ queues, rate limits) — not exposed publicly       │
                └──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  Neon Postgres (keep it — managed backups and point-in-time restore)
```

- **Keep the database on Neon for now.** It already holds production, and Neon does backups and point-in-time restore for you. You can move Postgres onto the VPS later, but then you own backups.
- **Run Redis on the VPS.** This matches your earlier plan. It's used for queues, the email budget and rate limits.
- **Serve the frontend from the VPS too,** not only Vercel. The website builder's custom domains already support **Caddy on-demand TLS** (`SITES_DOMAIN_PROVIDER=caddy`): each school points its domain at the server and gets HTTPS automatically. Caddy asks the backend first (`/api/v1/public/sites/caddy-ask`), so only verified domains get certificates.

## 3. First-time server setup (about 30 minutes)

Run these as root on the new server, then continue as the `deploy` user.

```bash
# 3.1 Updates and a non-root user
apt update && apt -y upgrade
adduser deploy && usermod -aG sudo deploy
# Copy your SSH public key to /home/deploy/.ssh/authorized_keys, then TEST logging in as deploy.

# 3.2 Lock down SSH (only after key login works!)
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

# 3.3 Firewall: only SSH, HTTP, HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable

# 3.4 Basic protection and automatic security updates
apt -y install fail2ban unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# 3.5 Swap (helps builds on 8 GB)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 3.6 Docker (official repo)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable --now docker
```

**Never publish the Redis or Postgres ports** (`6379`, `5432`) to the internet. In production compose files, keep them without `ports:`, so they are reachable only inside Docker's network.

## 4. DNS (at your domain registrar or Cloudflare)

| Record | Name | Value |
|---|---|---|
| A | `app` | VPS IP |
| A | `api` | VPS IP |
| A | `sites` (optional platform subdomain root) | VPS IP |
| A | `*.sites` (free school subdomains like `school.sites.<domain>`) | VPS IP |

If you use Cloudflare, set these records to **DNS only** (grey cloud) at first, so Caddy can issue certificates. Schools with their own domain add a CNAME (or A record) pointing to your server. The Domains tab in the Website Builder shows them what to add.

## 5. What goes on the server

The repo doesn't yet include production Docker files. When you're ready, these need creating:
- `backend/Dockerfile`: multi-stage build that runs `npm ci`, `prisma generate` and `tsc`, then runs `node dist/server.js` as a non-root user.
- `deploy/docker-compose.prod.yml`: services `api`, `redis` (password, AOF on, no public port) and `caddy` (ports 80/443, volumes for certificates, serves `frontend/dist`).
- `deploy/Caddyfile`: `app.` and `api.` sites, plus an `on_demand_tls` block whose `ask` URL points at the backend's `caddy-ask` endpoint, for school domains.
- `deploy/.env.production.example`: every variable name, with no values.

Production environment settings (in a `.env` on the server only, never in git):

```
NODE_ENV=production
PORT=3001
APP_URL=https://api.<domain>
FRONTEND_URL=https://app.<domain>
DATABASE_URL=<Neon pooled URL>
REDIS_URL=redis://:<long-password>@redis:6379
TRUST_PROXY=1                      # behind Caddy, so rate limits see the real client IP
EMAIL_ENABLED=true
EMAIL_FROM=no-reply@eoncodigital.com
BREVO_API_KEY=<key>
EMAIL_WEBHOOK_TOKEN=<long random string>
FEE_DEMO_PAYMENTS_ENABLED=false    # must be false on a live system
SITES_DOMAIN_PROVIDER=caddy
PLATFORM_SITE_DOMAIN=sites.<domain>
# plus the JWT secrets, payment gateway keys, SMS, AI keys you already use
```

## 6. Deploying a new version

```bash
cd ~/peoplenit && git pull
docker compose -f deploy/docker-compose.prod.yml build api
docker compose -f deploy/docker-compose.prod.yml run --rm api npx prisma migrate deploy
docker compose -f deploy/docker-compose.prod.yml up -d
npm ci && npm run build          # frontend → frontend/dist, served by Caddy
docker compose -f deploy/docker-compose.prod.yml logs -f --tail=100 api
```

- **Before every migration:** back up Neon (use a Neon branch, or `pg_dump`). A migration can't be undone by reverting the code.
- **Branches first:** merge `origin/main` and `Habib` before the first VPS deploy. Production's database was migrated from `Habib` (see `docs/redesign/PRODUCTION_MIGRATION_2026-09-29.md`), but some of `main`'s features exist only on `main`.
- **Later:** a GitHub Actions workflow can build and deploy automatically on a merge to `main`.

## 6a. CI/CD plan (GitHub Actions → Contabo)

**Flow on every push to `main`:**
```
push to main
  → CI: lint, typecheck, backend tests (Postgres + Redis), site tests, frontend build
  → build 2 Docker images → GitHub Container Registry (tagged with the commit SHA)
       api  = Express backend
       web  = frontend + Caddy (HTTPS, school domains)
  → [approval in GitHub, "production" environment]
  → SSH to the VPS → deploy.sh <sha>: pull images, (optional) migrate, restart, health check
  → smoke test https://app.<domain>/health
```

| Decision | Plan |
|---|---|
| Where images live | GitHub Container Registry (free with the repo) |
| Approval | GitHub "production" environment with required reviewers: nothing reaches the server without a click |
| Migrations | **Never automatic by default.** Run only via a manual deploy with "migrate" ticked (or by turning on the `AUTO_MIGRATE` variable later). Back up Neon before each one. |
| Rollback | Every image is kept by commit SHA. Re-run the deploy with the previous SHA, or run `deploy.sh --rollback` on the server. It restores the **code**, not the database. |
| Automatic safety | If the new version fails its health check, `deploy.sh` restarts the previous version by itself |
| Pull requests | CI only (tests and build), no deploy |
| Other branches | `Habib` and `dev` get CI; only `main` deploys |

**What you set up once in GitHub (Settings → Secrets and variables → Actions):**
- Secrets: `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` (a private key only for deploys), `VPS_KNOWN_HOSTS` (from `ssh-keyscan <vps-ip>`)
- Variables: `APP_DOMAIN`, `API_DOMAIN`, `PLATFORM_SITE_DOMAIN`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`
- Environment `production` with you as the required reviewer

**Files involved (drafted, uncommitted until the owner approves):**
- `deploy/api.Dockerfile`, `deploy/web.Dockerfile`, `deploy/Caddyfile`
- `deploy/docker-compose.prod.yml`, `deploy/deploy.sh`
- `deploy/.env.production.example`, `deploy/.env.api.example`
- `.dockerignore`
- `.github/workflows/deploy.yml`, plus Redis and site tests added to `ci.yml`

**Order of work when approved:**
1. Merge `main` and `Habib`. Production must run one codebase, and the `StaffAttendance` conflict gets resolved here.
2. Finish the Docker files and test the full stack locally.
3. Buy the VPS and do the server setup in §3; add the DNS records in §4.
4. Add the GitHub secrets and variables; do a first manual deploy.
5. Move DNS for `app.` / `api.` to the VPS. Keep Vercel running as a fallback for a week, then remove it.

## 7. Keeping it healthy

| Need | Tool |
|---|---|
| Container restarts after a crash or reboot | `restart: unless-stopped` on every service |
| Uptime alerts | Uptime Kuma (a free container), or UptimeRobot on `https://api.<domain>/health` |
| Error tracking | Sentry (the backend already reads `SENTRY_DSN`) |
| Log size | Docker log rotation: in `/etc/docker/daemon.json`, set `"log-opts": {"max-size": "10m", "max-file": "5"}` |
| Server snapshots | Contabo Auto Backup, plus a manual snapshot before big changes |
| Database backups | Neon point-in-time restore; optional nightly `pg_dump` to off-server storage |
| Disk | `docker system prune -af` monthly; watch `df -h` |

## 8. Cost estimate (per month)

| Item | Cost |
|---|---|
| Contabo Cloud VPS 10 | about $5 |
| Contabo Auto Backup | about $2 |
| Neon Postgres | free tier, until it's outgrown |
| Brevo | free (300 emails/day) |
| **Total** | **about $7** |
