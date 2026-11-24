# Dwellio

> **Your Home, in Good Hands.**
> *Production-Ready Full-Stack Home Services Platform (Version 1.0)*
> 📄 **[Release Notes v1.0](RELEASE_NOTES_V1.0.md)** | 📖 **[Production Deployment Runbook](DEPLOYMENT.md)**

Dwellio is an enterprise-grade full-stack home-services platform connecting homeowners with vetted, admin-approved service professionals (electricians, plumbers, painters, AC repair, and appliance technicians). Featuring real-time Socket.IO messaging, BullMQ background lifecycle workers, an escrow-backed double-entry financial ledger, and hardened production observability.

---

## 🛠️ Technology Stack

* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
* **Backend**: Node.js, Express, TypeScript
* **Database**: MongoDB with Mongoose (configured for local dev: `mongodb://localhost:27017/dwellio`)
* **Testing**: Vitest and Supertest
* **Workspace Management**: npm workspaces monorepo
* **Design Tokens**:
  * Deep Teal: `#172B35`
  * Soft Mint: `#B8D9CF`
  * Warm Ivory: `#F6F4EC`

---

## 📁 Repository Structure

```text
Dwellio/
├── apps/
│   ├── frontend/         # Client web application (Vite + React + Tailwind)
│   └── backend/          # REST API server (Express + TypeScript + Mongoose)
├── packages/
│   └── shared/           # Common TypeScript types, enums, and contracts
├── tests/
│   └── e2e/              # Playwright E2E tests (Phase 7)
├── docs/                 # Architectural & database specifications
└── .github/              # Automation workflows
```

---

## 🗄️ Database Models (Phase 2 Foundation)

* **`User`**: Account identity supporting `name`, normalized unique `email`, required `passwordHash`, `role` (`customer`, `provider`, `admin`), `isActive`, and timestamps.
* **`ProviderProfile`**: Extended provider data linked 1-to-1 with `User` via unique `userId`, storing `displayName`, `phone`, `serviceArea`, `skills` array, `verificationStatus` (`pending`, `approved`, `rejected`), and timestamps.

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: `v20+` (verified on `v24.14.0`)
* **npm**: `v10+` (verified on `11.9.0`)
* **MongoDB**: Running locally at `mongodb://localhost:27017`

### 2. Installation
Install all dependencies across all workspaces from the project root:
```bash
npm install
```

### 3. Build Packages
Compile shared types and build the workspaces:
```bash
npm run build
```

### 4. Running Automated Tests
Run model validation and integration test suites via Vitest:
```bash
npm test
```

### 5. Running the Development Servers

Run backend and frontend concurrently:
```bash
npm run dev
```

Or run services individually:
```bash
# Start backend (http://localhost:5000)
npm run dev:backend

# Start frontend (http://localhost:5173)
npm run dev:frontend
```

### 6. Health & Observability Endpoints
* **Frontend Home**: [http://localhost:5173](http://localhost:5173)
* **General API Health**: `GET /api/health`
* **Process Liveness Probe**: `GET /api/health/liveness` (returns 200 `{ status: "ok" }`)
* **Service Readiness Probe**: `GET /api/health/readiness` (returns 200 `{ status: "ready" }` if MongoDB and Redis are healthy, 503 otherwise)
* **Database Health**: `GET /api/health/db` (returns 200 `{ status: "ok" }` if connected, 503 if disconnected)
* **Redis Health**: `GET /api/health/redis` (returns 200 `{ status: "ok" }` if Redis responds to PING, 503 if unavailable)
* **Distributed Tracing**: All API responses include `X-Request-Id` (propagating client header or assigning a UUID v4).

### 7. Authentication Endpoints (Phase 3)
* **Register Customer**: `POST /api/auth/register` (body: `{ name, email, password }`)
* **Login**: `POST /api/auth/login` (body: `{ email, password }` -> returns `{ user, token }`)
* **Current User Profile**: `GET /api/auth/me` (header: `Authorization: Bearer <token>`)
* **Role-Based Access Control**: Middleware `requireAuth` and `requireRole('customer' | 'provider' | 'admin')` enforce role boundaries on the server.

### 8. Provider Onboarding & Admin Endpoints (Phase 4)
* **Apply as Provider**: `POST /api/providers/apply` (body: `{ displayName, phone, serviceArea, skills }`, authenticated, forced to `pending`)
* **Check Application Status**: `GET /api/providers/application-status` (authenticated applicant)
* **List Provider Applications**: `GET /api/admin/providers/applications` (admin-only, paginated, supports `?status=pending|approved|rejected`)
* **Get Application Details**: `GET /api/admin/providers/applications/:id` (admin-only)
* **Approve Application**: `PATCH /api/admin/providers/applications/:id/approve` (admin-only, creates immutable AuditLog, elevates user role to `provider`)
* **Reject Application**: `PATCH /api/admin/providers/applications/:id/reject` (admin-only, body: `{ reason }`, creates immutable AuditLog)
* **Server-Side Approval Verification**: Middleware `requireApprovedProvider` strictly checks the database verification status (`approved`) on every provider request, never trusting JWT claims alone.

### 9. Admin Account Provisioning
Seed the initial administrator account securely via local CLI (never exposed publicly via HTTP):
```bash
npm run seed:admin
```
*(In production, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (minimum 12 characters) as environment variables before executing).*

---

## 🐳 Containerized Deployment (Docker & Docker Compose)

Dwellio includes full multi-stage Dockerfiles and an orchestrated `docker-compose.yml` for local container testing and production deployment.

### 1. Prerequisites
* **Docker Engine**: `v24+` (Docker Desktop on Windows/macOS, or Docker Engine on Linux)
* **Docker Compose**: `v2+` (`docker compose`)

### 2. Environment Setup
Copy the template environment file:
```bash
cp .env.example .env
```
Configure `JWT_SECRET` in `.env` with a secure key of at least 32 characters in production.

### 3. Build & Start Services
Build container images and start the full stack in detached mode:
```bash
# Build images
npm run docker:build

# Launch services (MongoDB, Backend API, Frontend Nginx)
npm run docker:up
```

### 4. Inspecting Health & Logs
Check container status and healthcheck readiness:
```bash
# View service status and healthcheck states
docker compose ps

# Follow backend logs
docker compose logs -f backend

# Follow frontend reverse-proxy logs
docker compose logs -f frontend
```

* **Frontend Application**: [http://localhost](http://localhost) (port 80)
* **API Health Check**: [http://localhost/api/health](http://localhost/api/health) (routed via Nginx reverse proxy to backend)
* **Backend Direct (Dev/Debug)**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
* **MongoDB (Local Dev Binding)**: `127.0.0.1:27017`

### 5. Stopping Containers Safely
Stop all services while preserving database data:
```bash
npm run docker:down
```
> [!IMPORTANT]
> The persistent database is stored in the Docker named volume `dwellio_mongodb_data`. Do **not** use `docker compose down -v` unless you intentionally wish to delete all persistent database records.

### 6. Production Deployment & Orchestration
For hardened production deployments, use `docker-compose.prod.yml`, which isolates MongoDB and Redis within an internal Docker network (no ports exposed to the host) and configures explicit resource limits and restart policies.
```bash
docker compose -f docker-compose.prod.yml up -d
```
See the complete production guide in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### 7. Database Backups & Disaster Recovery
Production backup and safe restoration scripts are located in `scripts/`:
* **Create Backup**:
  ```bash
  bash scripts/backup-db.sh
  ```
  Generates a timestamped, gzip-compressed archive in `backups/dwellio_backup_YYYYMMDD_HHMMSS.archive.gz`.
* **Restore Database**:
  ```bash
  bash scripts/restore-db.sh backups/<archive-file>.archive.gz --db dwellio --confirm
  ```
  Includes guardrails preventing accidental overwrite of production databases unless `--force-production-restore` is supplied.

---

## 🧪 Testing Suites

```bash
# Run backend and frontend unit & integration tests
npm test

# Run deployment smoke test suite
npm run test:e2e:smoke

# Run comprehensive full user journey integration tests
npm run test:e2e:journeys

# Run real Redis & BullMQ integration tests (requires running Redis instance)
npm run test:redis-integration

# Run Playwright browser end-to-end tests (requires running frontend/stack)
npm run test:e2e
```

### Real Redis & BullMQ Integration Suite
The test suite includes an opt-in integration suite (`tests/redis.bullmq.integration.test.ts`) that verifies genuine BullMQ Lua execution (`cmsgpack` engine), live Redis job scheduling, worker processing, and deduplication against a live Redis server.
1. Start Redis:
   ```bash
   docker compose up redis -d
   ```
2. Run the integration test suite:
   ```bash
   npm run test:redis-integration
   ```
3. To configure a non-default host/port/auth:
   ```bash
   REDIS_TEST_URL="redis://:password@host:6379" npm run test:redis-integration
   ```

---

## ⚠️ Known Deployment Limitations & Security Notes

1. **Build-Tooling Dev Dependencies (SEC-09):** `npm audit` reports 7 dev-dependency advisories in `tailwindcss@^3.4.17`'s build toolchain (`braces`, `postcss-selector-parser`). These exist exclusively in `devDependencies` used by Vite during development/bundling and are **not** present in production runtime. Upstream resolution requires migrating to `tailwindcss@4`, which is a breaking change and will be scheduled as a dedicated migration.
2. **In-Memory Rate Limiting (SEC-03):** Express rate limits are held in process memory. In horizontally scaled multi-replica environments, a distributed Redis store (`rate-limit-redis`) is recommended.
3. **TLS Termination:** The container stack listens on HTTP port 80. For production internet deployment, TLS/HTTPS termination should be configured at an external reverse proxy, cloud load balancer, or CDN (e.g. Cloudflare, AWS ALB, Let's Encrypt Nginx).


