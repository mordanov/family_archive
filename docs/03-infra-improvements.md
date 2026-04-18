# Family Archive — Infrastructure Improvement Recommendations

> Concrete, prioritised steps for evolving v1 toward better **scalability**,
> **fault tolerance**, and **high availability** — *only when needed*. v1 is
> deliberately tiny and fits the family's actual usage. Adopt these in order;
> stop the moment the system feels boring again.

The grid below summarises the recommendations; details follow.

| # | Area | Item | Effort | Cost / month | Triggers it |
|---|---|---|---|---|---|
| 1 | Fault tolerance | Off-site Postgres backup (pg_dump → object storage) | S | ~€0 | adopt now |
| 2 | Fault tolerance | Bucket lifecycle: orphan multipart cleanup + versioning | S | ~€0 | adopt now |
| 3 | Observability | Structured logs to file + log rotation; uptime probe | S | €0–3 | adopt now |
| 4 | Fault tolerance | Snapshot-based VPS backup (provider-side) | S | ~€2 | adopt now |
| 5 | Scalability | Run more uvicorn workers; tune nginx worker_connections | XS | €0 | sustained CPU > 60% |
| 6 | Scalability | Split workers into a sibling `archive-worker` container | S | €0 | API jitter during ffmpeg |
| 7 | Scalability | CDN (Cloudflare free) in front of share links + thumbnails | S | €0 | a share goes viral |
| 8 | Fault tolerance | Move sessions/rate-limit to Redis or PG (already in PG) | S | €0 | a second backend instance |
| 9 | HA | Hot standby Postgres (logical replication) | M | +€5–10 | RPO < 1 h required |
| 10 | HA | Active/standby VPS pair with shared object storage + DNS failover | M | +VPS cost | RTO < 15 min required |
| 11 | HA | Multi-region object storage replication | M | +storage cost | regional outage tolerance |
| 12 | Hardening | WAF / fail2ban-style protections; security headers (HSTS, CSP) | S | €0 | first abuse attempt |
| 13 | Operability | Monitoring stack (Prometheus + Grafana / Uptime Kuma) | M | €0–5 | when on-call becomes a thing |
| 14 | Cost | Lifecycle: auto-tier old large objects to "cold" storage | S | savings | > ~5 TB stored |

Effort scale: XS = under 1 h, S = a few hours, M = 1–2 days.

---

## 1. Off-site Postgres backup (do this now)
The shared Postgres instance lives on the same VPS as the application. A
single-VPS loss = data loss. Mitigation:

- A nightly `pg_dump archive | zstd | aws s3 cp -` to a **separate bucket**
  (or a bucket in a different region of Hetzner) — outside the application's
  own bucket so a backend bug cannot wipe the backup.
- Keep 7 daily, 4 weekly, 12 monthly snapshots (~28 GB cap for any reasonable
  PG size).
- Restoration drill quarterly: bring up a throwaway VPS, run `pg_restore`,
  point a copy of the app at the bucket in read-only mode, click around,
  destroy.

Add as a sibling container in the shared compose:
```yaml
archive-pg-backup:
  image: postgres:16-alpine    # already in cache
  entrypoint: /bin/sh
  command: ["-c", "/usr/local/bin/backup.sh"]
  volumes: [./scripts/backup.sh:/usr/local/bin/backup.sh:ro]
  environment: { PGHOST: recipes-db, PGUSER: archive_user, PGPASSWORD: ... }
```
plus a host cron entry that `docker compose run --rm` it at 03:00.

## 2. Bucket lifecycle policies (do this now)
On the Hetzner bucket:
- **Abort incomplete multipart uploads after 7 days** — prevents the
  "phantom storage cost" failure mode that bites every S3 user eventually.
  Belt-and-braces alongside the in-app multipart GC worker.
- **Enable object versioning** for the bucket. Costs only *changed* bytes.
  Even a buggy `delete_object` call from the backend would still leave the
  object recoverable for the configured retention.
- **Lifecycle: noncurrent versions to deep storage / expire after 30 days**
  (matches the trash retention).

These are one-time clicks in the provider console; document them in
`deploy/bucket-policy.md`.

## 3. Structured logs + uptime probe (do this now)
- Pipe backend stdout to `journald` via Docker's `journald` log driver, so
  `journalctl -u docker -f` works.
- An external probe (Uptime Kuma on a tiny separate VPS, or
  Better Uptime free, or a Pingdom-equivalent) hitting `/health` every minute.
  This is the single highest-value monitoring upgrade for ~zero effort.
- Alert channel: email or a Telegram webhook to both family members.

## 4. Provider-side VPS snapshot (do this now)
Hetzner offers daily snapshots for ~€2/month. Enable it on the VPS. This
covers the "I broke the server while updating" failure mode. Rebuild from
snapshot is single-click and ~5 minutes.

---

## 5. Vertical scaling first (when CPU climbs)
Before reaching for replicas, just increase concurrency:
```Dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000",
     "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
```
Pair with `worker_connections 2048;` in nginx if needed. A 2-vCPU VPS with
4 uvicorn workers comfortably handles thousands of file ops/min.

## 6. Worker split (when ffmpeg makes the API jitter)
The codebase already isolates workers under `app/workers/`. Add one more
service to compose:
```yaml
archive-worker:
  image: family-archive-backend:latest   # same image
  command: ["python", "-m", "app.workers.manager"]
  environment: { ...same as archive-backend... }
  depends_on: [recipes-db]
```
and disable the workers in the API container by setting `RUN_WORKERS=0`.
No schema changes. No code changes (the manager already supports the env
flag — verify in `workers/manager.py`).

## 7. CDN in front of share traffic (cheap, when needed)
Family shares with grandparents → small. Family share that goes mildly viral
("here's the wedding video", 200 cousins) → suddenly your backend becomes
a CDN. Solution:

- Park `archive.<domain>` behind Cloudflare (free plan).
- All authenticated traffic (`/api/*`) is set to **bypass cache** (already
  the case because cookies + `Cache-Control` headers).
- Public share download (`/shares/<token>/download`) and thumbnails carry
  `Cache-Control: public, max-age=604800, immutable` (already set in v1
  for thumbnails; add for share-download by passing the file's UUID into
  the URL so it's safe to cache long-term).
- Result: one fetch from origin per share link, then served from CDN edge.
- Cost: zero on the free plan, single-digit € on the paid plan.

## 8. Move sessions / rate-limit out of memory (when adding a 2nd backend)
Sessions are already in Postgres — multi-instance ready today. The
in-memory rate limiter is the only stateful piece left. Two options:
- **Redis**: simplest, adds one container. Use an `INCR` + `EXPIRE` pattern.
- **Postgres advisory locks + a `rate_limit_events` table**: zero new
  components. Slightly heavier on the DB but fine for our load.

Recommend Postgres until traffic justifies Redis (it almost certainly never will).

---

## 9. Hot-standby Postgres (when RPO < 1 h matters)
- Provision a second PG instance on a different VPS (or same VPS in a
  separate compose project for development; on a separate VPS for production).
- Set up **streaming replication** (built into Postgres). Replica is
  read-only, lag < 1 s under normal load.
- Failover playbook in `docs/runbooks/pg-failover.md`: stop the primary,
  promote the replica, point `DATABASE_URL` at the new endpoint, restart
  `archive-backend`. ~5 minutes manual; add `pg_auto_failover` if even that
  is too slow.

Combined with off-site backup (item 1), this gives:
- RPO ≈ seconds (replication) → falls back to ≤ 24 h (last backup).
- RTO ≈ minutes (manual failover) → falls back to ≤ 1 h (rebuild from snapshot+backup).

## 10. Active/standby VPS pair (when RTO < 15 min matters)
- Two VPSes (call them A and B), both running the same compose stack.
- A is live, B is idle but **continuously builds the same images** via the
  same CI pipeline (no drift).
- DNS uses a low-TTL A record (60 s).
- Failover script flips the A record to B and runs `deploy.sh` on B to wake
  the application. Object storage is naturally shared because S3 is global.
- Cost: ~2× VPS cost. Reasonable only for users who would actually notice
  15 minutes of downtime.

For the family archive, this is **almost certainly overkill** until a real
"this matters" scenario emerges (running a tiny business off the same stack,
hosting wedding albums for relatives, etc.).

## 11. Multi-region object replication (when regional outage tolerance matters)
Hetzner Object Storage offers cross-region replication. Enabling it doubles
the storage bill but lets you survive a full region going dark. Useful only
if you have already done items 9 and 10 — without them, the bottleneck is
elsewhere.

---

## 12. Hardening (do incrementally; first abuse → first batch)

### Security headers
In `archive-https.conf.template`:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'" always;
```
The CSP above is compatible with the v1 frontend (no inline scripts thanks to
Vite's hashed bundle).

### Rate limiting at the edge
Nginx `limit_req_zone` per IP for `/api/v1/auth/login` and `/api/v1/shares/`,
*in addition to* the in-app limiter. Stops the application layer from being
hit at all by simple flood attacks.

### Connection-level abuse
fail2ban with a jail watching for repeated 401s and 429s. Bans IPs at the
firewall level for an hour.

### Secrets rotation
A documented runbook for rotating:
- `SECRET_KEY` (invalidates all sessions on rotation — by design).
- S3 access keys (rotate at the provider, update `.env`, restart backend).
- DB password (use the existing `db-password-sync` mechanism with a new value).

## 13. Monitoring stack (when one or both family members are tired of being on-call)
- **Uptime Kuma** in a tiny separate VPS for liveness probes and alerting.
- **Prometheus + Grafana** if you want metrics:
  - `node_exporter` for VPS-level (CPU, RAM, disk, network).
  - Uvicorn metrics via `prometheus-fastapi-instrumentator` (one line of code
    to add in `main.py`).
  - Postgres metrics via `postgres_exporter`.
  - Hetzner Object Storage usage via a small periodic script that hits the
    bucket's `ListObjectsV2 + sum(size)`.
- One pre-built Grafana dashboard: "VPS health", "Application latency",
  "Storage usage and cost projection".

For 2 users, **Uptime Kuma is enough**. Bring in Prometheus only if and when
the system starts hosting things that justify it.

## 14. Cost optimisation (when storage > a few TB)
- If the archive grows past a couple of TB and most of the bytes are
  rarely-accessed videos:
  - Move objects older than N days into Hetzner's cheaper "cold" tier via a
    bucket lifecycle rule.
  - Or split: keep recent year on hot tier, older years on cold tier.
- A nightly script can also report top-10 largest files to the family group
  chat, prompting natural cleanup.

---

## What we deliberately are **not** recommending
- **Kubernetes / K3s**: the whole stack is 3 containers. Operational cost of
  a cluster vastly exceeds any benefit at our scale.
- **Service mesh / Istio / Linkerd**: same reason.
- **Microservices split** (separate auth-service, files-service, etc.):
  premature decomposition at 2 users.
- **GraphQL**: REST is a perfect fit and easier to debug.
- **A custom mobile app**: responsive web works on every phone the family
  uses; native app is multi-month effort with no functional gain.
- **Server-side encryption with our own keys (SSE-C / SSE-KMS)**: explicit
  Phase 0 decision; Hetzner's at-rest encryption is sufficient and SSE-C
  would lose the family their data forever the day they lose the key.

## Suggested adoption sequence
**Year 1 (first quarter)**: items 1, 2, 3, 4, 12 (basic security headers).
**Year 1 (later)**: item 7 only if a share link gets > 100 downloads.
**Year 2+**: items 5, 6 if usage grows; 9 + 13 if the family starts trusting
the system enough to use it as a primary archive.
**Probably never**: items 10, 11.

The system is sized so that a single attentive human can run it in
~2 hours / year of maintenance. Every recommendation above should be
weighed against that budget.

