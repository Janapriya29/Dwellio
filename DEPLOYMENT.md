# Dwellio Production Deployment Runbook (Version 1.0)

**Project:** Dwellio — "Your Home, in Good Hands."  
**Target Release:** Version 1.0  
**Stack:** Node.js 20 LTS, React 18, Express, MongoDB 7.0, Redis 7.2, BullMQ 6, Nginx Alpine, Docker Compose.

---

## 1. Production Architecture Overview

The Dwellio Version 1.0 production deployment runs as an isolated, containerized stack behind Cloudflare CDN and an Nginx reverse proxy:

```
[ Clients / Mobile / Browsers ]
               │
               ▼ (HTTPS / TLS 1.3, Edge Caching, DDoS Protection)
       [ Cloudflare CDN ]
               │
               ▼ (Port 443 -> Port 80 on VPS)
┌───────────────────────────────────────────────────────────────┐
│ Ubuntu 24.04 LTS VPS (Compute Host)                           │
│                                                               │
│   ┌────────────────────────────────────────────────────────┐  │
│   │ Nginx Reverse Proxy (Frontend Container)              │  │
│   │   - Serves React SPA (Static assets cached with gzip)  │  │
│   │   - Proxies /api/* to Express Backend (Port 5000)      │  │
│   │   - Proxies /socket.io/* (WebSocket Upgrades enabled)  │  │
│   │   - Proxies /api/notifications/stream (SSE unbuffered) │  │
│   └───────────────┬────────────────────────┬───────────────┘  │
│                   │                        │                  │
│                   ▼                        ▼                  │
│       ┌───────────────────────┐ ┌─────────────────────┐       │
│       │ Dwellio Backend API   │ │ Dwellio Worker      │       │
│       │ (Express + Socket.IO) │ │ (BullMQ Supervisor) │       │
│       └───────────┬───────────┘ └──────────┬──────────┘       │
│                   │                        │                  │
│                   ├────────────────────────┘                  │
│                   ▼                                           │
│       ┌───────────────────────┐ ┌─────────────────────┐       │
│       │ MongoDB 7.0           │ │ Redis 7.2-Alpine    │       │
│       │ (Internal Network)    │ │ (AOF Persistent)    │       │
│       └───────────────────────┘ └─────────────────────┘       │
│                   │                                           │
│                   ▼ (Nightly Backup Cron)                     │
│       [ Encrypted S3 Bucket / Local Archive ]                 │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure Provisioning

### 2.1 Hardware Requirements
- **VPS Specification:** Minimum 2 vCPU, 4 GB RAM (Recommended: 4 vCPU, 8 GB RAM, 80 GB NVMe SSD).
- **Operating System:** Ubuntu 24.04 LTS (x86_64).
- **Supported Providers:** Hetzner Cloud, DigitalOcean Droplet, AWS EC2 (t4g.xlarge / c6i.large), Linode.

### 2.2 Host Hardening & Firewall (UFW)
```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y

# 2. Configure UFW Firewall (Only SSH and HTTP/HTTPS public access)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Cloudflare traffic)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Note: Ports 27017 (MongoDB) and 6379 (Redis) are NOT exposed on host interfaces.
```

### 2.3 Docker Engine Installation
```bash
# Install Docker and Docker Compose plugin
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add deployer user to docker group
sudo usermod -aG docker $USER
```

---

## 3. Application Deployment

### 3.1 Repository Setup
```bash
mkdir -p /opt/dwellio
cd /opt/dwellio
git clone https://github.com/janap/Dwellio.git .
git checkout master
```

### 3.2 Environment Variables Provisioning
Create `/opt/dwellio/.env` with strict production values:

```env
# Node Environment
NODE_ENV=production
PORT=5000

# Public URLs (Replace with your registered domain)
CLIENT_URL=https://app.dwellio.com
VITE_API_BASE_URL=/api

# Database Configuration (Internal Docker service)
MONGO_URI=mongodb://mongodb:27017/dwellio
MONGODB_MAX_POOL_SIZE=50
MONGODB_MIN_POOL_SIZE=5

# Redis Configuration (Internal Docker service)
REDIS_URL=redis://:CHANGE_THIS_TO_STRONG_REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=CHANGE_THIS_TO_STRONG_REDIS_PASSWORD
REDIS_TLS=false
REDIS_ENABLED=true

# Authentication (Must be unique, cryptographically random, >= 32 characters)
JWT_SECRET=GENERATE_STRONG_RANDOM_SECRET_AT_LEAST_32_CHARS_LONG
JWT_EXPIRES_IN=7d

# Payment Gateway Configuration (Razorpay)
# Mode: "test" for staging/QA; "live" for production transactions
RAZORPAY_MODE=test
RAZORPAY_LIVE_ENABLED=false
RAZORPAY_KEY_ID=rzp_test_YOUR_TEST_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_TEST_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_TEST_WEBHOOK_SECRET
RAZORPAY_ROUTE_ENABLED=true

# Observability
LOG_LEVEL=info
```

> [!IMPORTANT]
> To generate a secure 32+ character JWT secret:
> ```bash
> openssl rand -hex 32
> ```

### 3.3 Starting the Production Stack
```bash
# Validate configuration syntax
docker compose -f docker-compose.prod.yml config

# Build and start all 5 containers in detached mode
docker compose -f docker-compose.prod.yml up --build -d

# Check running status
docker compose -f docker-compose.prod.yml ps
```

---

## 4. Networking, DNS & SSL Configuration

### 4.1 Cloudflare DNS Setup
1. Point your domain A record to your VPS Public IP:
   - `app.dwellio.com` -> `[VPS_IP]` (Proxied: Yes, Orange Cloud)
2. In Cloudflare SSL/TLS Settings:
   - Mode: **Full** or **Full (Strict)**.
   - Enable **Always Use HTTPS**.
   - Enable **Automatic HTTPS Rewrites**.
   - Enable **WebSockets** (under Network settings in Cloudflare Dashboard).

### 4.2 Reverse Proxy Verification
The Nginx container handles reverse proxying:
- `/` -> React SPA with client-side hash routing (`#/`).
- `/api/*` -> Express HTTP backend.
- `/socket.io/*` -> WebSocket protocol upgrade to Socket.IO.
- `/api/notifications/stream` -> Server-Sent Events with `proxy_buffering off;`.

Test the endpoints:
```bash
# 1. API Health Check
curl -I https://app.dwellio.com/api/health

# 2. Database Health
curl https://app.dwellio.com/api/health/db

# 3. Redis Health
curl https://app.dwellio.com/api/health/redis

# 4. Liveness Probe
curl https://app.dwellio.com/api/health/liveness

# 5. Readiness Probe
curl https://app.dwellio.com/api/health/readiness
```

---

## 5. Payment Gateway Setup (Razorpay)

### 5.1 Razorpay Onboarding Checklist
1. Register and complete KYC on [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Link your company bank account for customer payment settlement.
3. Generate API Keys in **Settings > API Keys**:
   - `rzp_test_*` for staging testing.
   - `rzp_live_*` for production.

### 5.2 Webhook Configuration
1. In Razorpay Dashboard, navigate to **Settings > Webhooks > Add New Webhook**.
2. **Webhook URL:** `https://app.dwellio.com/api/payments/webhook`
3. **Secret:** Set a strong secret and copy into `RAZORPAY_WEBHOOK_SECRET` in `.env`.
4. **Active Events:**
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
   - `refund.processed`
   - `refund.failed`

### 5.3 Activating Live Payment Mode
To switch from Test Mode to Live Mode:
1. Update `.env`:
   ```env
   RAZORPAY_MODE=live
   RAZORPAY_LIVE_ENABLED=true
   RAZORPAY_KEY_ID=rzp_live_YOUR_ACTUAL_LIVE_KEY_ID
   RAZORPAY_KEY_SECRET=YOUR_ACTUAL_LIVE_KEY_SECRET
   RAZORPAY_WEBHOOK_SECRET=YOUR_ACTUAL_LIVE_WEBHOOK_SECRET
   ```
2. Restart backend:
   ```bash
   docker compose -f docker-compose.prod.yml restart backend
   ```
   > [!NOTE]
   > The application startup gate (`validateConfig()`) strictly checks that `RAZORPAY_LIVE_ENABLED=true`, `NODE_ENV=production`, and `RAZORPAY_KEY_ID` begins with `rzp_live_`.

### 5.4 Provider Payout Fulfillment
- Dwellio Version 1.0 maintains an internal immutable balance subledger (`ProviderLedger`) and groups payouts into batches (`PayoutBatch`).
- Once an administrator clicks **Approve & Settle Batch** in the Admin Dashboard, the platform marks the ledger entries as `settled`.
- The platform operator performs the actual bank wire (via NEFT/RTGS/IMPS or net-banking) using the bank details exported from the Payout Batch view.
- Automated API bank disbursements via RazorpayX are roadmapped for Version 2.0.

---

## 6. Database Backup & Disaster Recovery

### 6.1 Automated Daily Backups
The repository provides `scripts/backup-db.sh` using `mongodump` with gzip compression.

Set up a daily cron job:
```bash
# Edit crontab
crontab -e

# Add daily backup at 02:00 AM UTC
0 2 * * * /opt/dwellio/scripts/backup-db.sh /var/backups/dwellio >> /var/log/dwellio-backup.log 2>&1
```

### 6.2 Manual Backup Command
```bash
# Execute local compressed backup
MONGO_URI="mongodb://localhost:27017/dwellio" ./scripts/backup-db.sh ./backups
```

### 6.3 Safe Database Restoration
To restore a backup safely into a staging verification database:
```bash
# 1. Restore into an isolated database to verify integrity
./scripts/restore-db.sh \
  --archive ./backups/dwellio_backup_20261124_020000.archive.gz \
  --db dwellio_restore_verify \
  --confirm

# 2. Emergency Production Restore (Requires double confirmation flags)
./scripts/restore-db.sh \
  --archive ./backups/dwellio_backup_20261124_020000.archive.gz \
  --db dwellio \
  --confirm \
  --force-production-restore
```

---

## 7. Operations, Monitoring & Updates

### 7.1 Inspecting Logs
Logs are emitted with ISO timestamps, severity level, and request correlation IDs (`X-Request-Id`):
```bash
# Tail backend API logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 backend

# Tail worker background processing logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 worker

# Search logs for a specific user request ID
docker compose -f docker-compose.prod.yml logs backend | grep "req_trace_id_here"
```

### 7.2 Background Queue Health Monitoring
Administrators can inspect live BullMQ queue stats at:
- **UI:** Admin Panel > System Queues (`#/admin`)
- **API:** `GET /api/admin/queues/health` (Requires Admin Bearer token)

### 7.3 Zero-Downtime Rolling Update Procedure
```bash
# 1. Fetch latest verified commit
git pull origin master

# 2. Build new production images
docker compose -f docker-compose.prod.yml build

# 3. Recreate backend and worker without dropping database
docker compose -f docker-compose.prod.yml up -d --no-deps backend worker frontend

# 4. Prune unused dangling Docker images
docker image prune -f
```

### 7.4 Rollback Procedure
If a deployment exhibits regressions:
```bash
# Revert to previous Git commit
git checkout PREVIOUS_VERIFIED_COMMIT_HASH

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```
