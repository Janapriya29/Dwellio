# Dwellio Architecture Overview

> **Tagline:** Your Home, in Good Hands.

## 1. System Architecture

Dwellio uses an npm workspaces monorepo structure designed to scale from prototype to deployment:

```text
Dwellio/
├── apps/
│   ├── frontend/         # React, Vite, TypeScript, Tailwind CSS
│   └── backend/          # Node.js, Express, TypeScript, Mongoose
├── packages/
│   └── shared/           # Common TypeScript types, enums, and API envelopes
├── tests/
│   └── e2e/              # Playwright end-to-end test suites
├── docs/                 # Documentation and architecture guides
└── .github/workflows/    # CI/CD pipelines
```

## 2. Design Tokens

The frontend adheres to the Dwellio brand palette:

* **Deep Teal (`#172B35`)**: Primary brand color for headings, text, and primary actions.
* **Soft Mint (`#B8D9CF`)**: Accent color for badges, highlights, and borders.
* **Warm Ivory (`#F6F4EC`)**: Neutral background for screens and surface cards.

## 3. Roles and Core Access Boundaries

* **Customer**: Discovers verified providers via room-based visual navigation, books appointments, files complaints, and reviews completed services.
* **Service Provider**: Onboards with dummy identity verification, sets availability and service categories, receives bookings, and updates progress.
* **Admin**: Reviews provider applications, verifies mock documents, resolves complaints, and reviews audit logs.

## 4. Database Integration (Planned for Phase 2)

* **Engine**: MongoDB with Mongoose ODM.
* **Default Connection**: `mongodb://localhost:27017/dwellio`.
* **Planned Collections**:
  * `users`: Identity, authentication credentials, and user role.
  * `provider_profiles`: Provider bio, verification state, documents, and ratings.
  * `categories` & `services`: Service catalog mapped to household rooms.
  * `bookings`: Appointment lifecycle and direct payment reference records.
  * `reviews`: Verified reviews strictly linked to completed bookings.
  * `complaints`: Dispute tickets and administrative resolution notes.
  * `loyalty_rewards`: Customer loyalty points.
  * `audit_logs`: Administrative actions log.

## 5. Security & Verification Policy

1. **Dummy Documents Only**: Prototype verification accepts mock documents only; no real government IDs or sensitive documents are collected.
2. **Direct Payment Evidence**: Payment screenshots uploaded by customers serve as claimed reference receipts for providers, not proof of financial settlement.
3. **Admin Verification Gate**: Only admin-approved providers can receive bookings.
