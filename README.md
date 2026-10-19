# Dwellio

> **Your Home, in Good Hands.**

Dwellio is a modern full-stack home-services platform that connects homeowners with admin-approved service professionals (electricians, plumbers, painters, AC repair, and appliance technicians).

---

## 🛠️ Technology Stack

* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
* **Backend**: Node.js, Express, TypeScript
* **Database**: MongoDB (via Mongoose — integrated in Phase 2)
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
│   └── backend/          # REST API server (Express + TypeScript)
├── packages/
│   └── shared/           # Common TypeScript types and contracts
├── tests/
│   └── e2e/              # Playwright E2E tests (Phase 7)
├── docs/                 # Architectural specifications
└── .github/              # Automation workflows
```

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

### 4. Running the Development Servers

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

### 5. Verification Endpoints
* **Frontend Home**: [http://localhost:5173](http://localhost:5173)
* **Backend Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
