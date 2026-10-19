# Dwellio

> **Your Home, in Good Hands.**

Dwellio is a modern full-stack home-services platform that connects homeowners with admin-approved service professionals (electricians, plumbers, painters, AC repair, and appliance technicians).

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

### 6. Health & Verification Endpoints
* **Frontend Home**: [http://localhost:5173](http://localhost:5173)
* **General API Health**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
* **Database Readiness**: [http://localhost:5000/api/health/db](http://localhost:5000/api/health/db) (returns HTTP 200 when connected, HTTP 503 if disconnected)

### 7. Authentication Endpoints (Phase 3)
* **Register Customer**: `POST /api/auth/register` (body: `{ name, email, password }`)
* **Login**: `POST /api/auth/login` (body: `{ email, password }` -> returns `{ user, token }`)
* **Current User Profile**: `GET /api/auth/me` (header: `Authorization: Bearer <token>`)
* **Role-Based Access Control**: Middleware `requireAuth` and `requireRole('customer' | 'provider' | 'admin')` enforce role boundaries on the server.

