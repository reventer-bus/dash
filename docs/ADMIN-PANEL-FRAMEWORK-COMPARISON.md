# Admin Panel & Franchise Dashboard — Framework Comparison & Recommendation

> **Context:** FOFUS Manufacturing OS (3D printing franchise network, Kerala, India)
> **Stack:** FastAPI (port 4322, JWT RBAC + PostgreSQL already built) · React+Vite dashboard · PostgreSQL · Redis · Tailscale Funnel
> **Need:** Super-admin panel (`business.fofus.in`) + per-franchisee dashboard with data isolation, commission tracking, centralized product catalog
> **Date:** 2026-07-18

---

## Existing System (Key Facts)

The backend **already has** most of the multi-tenancy plumbing:

- **FastAPI `main.py`** — 14 routers, JWT auth (`auth.py`), admin endpoints (`admin_users.py`), partner scoping in `farm.py`
- **Roles already defined:** `super_admin`, `franchise_admin`, `partner`, `technician`, `artist`, `space_manager`
- **`require_role()` dependency factory** — endpoint-level RBAC gating already wired
- **`partner_id` scoping** — partner-scoped JWTs only see their own orders (403 on foreign orders)
- **PostgreSQL + Alembic** — migrated from JSONL (Phase 1, Jul 05)
- **`RBAC Matrix`** in ARCHITECTURE.md — fully specified per-role × per-resource
- **Frontend:** single 3323-line `Dashboard.jsx` monolith, Vite, hardcoded-session auth fallback (JWT login added Jul 05, `AUTH_ENFORCE=true` flip pending)

This means the framework choice is about the **frontend presentation layer + realtime**, not the backend. The backend is already multi-tenant-ready.

---

## Framework Comparison

### 1. Refine (refine.dev)

**Type:** React-based admin framework (code-first, not low-code)
**License:** MIT (fully open-source) · **Stars:** 35.3K · **Version:** v5 (CORE)

| Criterion | Assessment |
|-----------|------------|
| **Multi-tenancy** | ✅ Dedicated multitenancy guide. Tenant-aware `dataProvider` — pass `tenantId` from JWT claims into every query. Native pattern, not a workaround. |
| **RBAC** | ✅ `AccessControlProvider` + `<CanAccess>` component + `useCan()` hook. Integrations: Casbin, Cerbos, Permify. Maps cleanly to existing FastAPI JWT role claims. |
| **Realtime** | ✅ `LiveProvider` interface — subscribe/unsubscribe/publish. Built-in: Ably, Supabase, Appwrite, Hasura. **Custom WebSocket provider for FastAPI is ~50 lines.** Hooks (`useList`, `useTable`) auto-refetch on live events. |
| **FastAPI integration** | ✅ `dataProvider` pattern — write a custom REST data provider calling `/api/v1/*` with Bearer JWT from existing `auth.js` pattern. First-class support for custom providers. |
| **Self-hosting** | ✅ It's just a React app — build with Vite, serve as static files (FastAPI already serves `frontend/dist`). Or deploy to Vercel. No server-side runtime. |
| **Security** | ✅ You own the code. JWT in httpOnly cookies or localStorage (your choice). No third-party data passes through Refine's servers. |
| **Customization** | ✅ Headless — use Ant Design, Material UI, Chakra, Mantine, or **shadcn/ui** (new integration). Full JSX control. No visual-builder lock-in. |
| **Franchise-specific** | Per-franchisee isolation = pass `franchise_id` claim into data provider filters. Commission tracking = custom resources mapped to new `/api/v1/commissions/*` endpoints. Centralized catalog = `useList({ resource: "products" })` with admin-only write. |

**Strengths for FOFUS:**
- Drops into the **existing React+Vite stack** — not a replacement, an augmentation
- You already have JWT auth + role claims; Refine's `authProvider` wraps them directly
- Deploy to Vercel (matches existing `printdash` deployment) or self-host via FastAPI static mount
- No per-user licensing — unlimited franchises/partners at zero framework cost

**Weaknesses:**
- Code-first = more dev time than drag-and-drop for simple CRUD views
- Learning curve for Refine's provider/hook abstractions (~1-2 days)

---

### 2. Appsmith (appsmith.com)

**Type:** Low-code visual app builder
**License:** Apache 2.0 (open-source) · **Self-host:** Docker (single container: MongoDB+Redis+PostgreSQL bundled, 8GB RAM min)

| Criterion | Assessment |
|-----------|------------|
| **Multi-tenancy** | ⚠️ Via separate workspaces or separate instances — **no native per-tenant data isolation** in a single app. For FOFUS franchise model, you'd need one Appsmith instance per franchise OR build row-level filtering into every query manually. |
| **RBAC** | ✅ Granular Access Control — group/role-based, per-app, per-resource, per-action. SSO (Google, GitHub, SAML, OIDC). |
| **Realtime** | ⚠️ Limited. No native WebSocket subscription model. Polling-based refresh. Not comparable to Refine's LiveProvider for live printer status. |
| **FastAPI integration** | ✅ REST API datasource — connect to FastAPI via authenticated REST queries. Straightforward. |
| **Self-hosting** | ✅ Docker Compose, Kubernetes, AWS AMI, ECS, Azure, GCP, DigitalOcean, Ansible, Airgapped. Well-documented. |
| **Security** | ✅ Self-hosted, your data stays on your infra. SSO + SCIM provisioning. |
| **Customization** | ⚠️ Drag-and-drop canvas — fast for internal tools, but custom UX (franchise-facing branded dashboard) is constrained by widget system. |
| **Franchise-specific** | Commission/catalog require custom JS in query handlers. Per-franchise isolation is manual. Better for internal admin views than partner-facing portals. |

**Best fit:** Internal-only super-admin quick views (all orders, analytics) where custom branding doesn't matter.

---

### 3. Budibase (budibase.com)

**Type:** Low-code internal tools + AI agents (recent pivot toward AI automation)
**License:** Open-source (GitHub) · **Stars:** 28.1K · **Self-host:** Docker/Kubernetes/Helm

| Criterion | Assessment |
|-----------|------------|
| **Multi-tenancy** | ⚠️ Workspaces, not native tenant isolation. Similar limitation to Appsmith. |
| **RBAC** | ✅ App-level + row-level permissions. Builder/developer/admin roles. |
| **Realtime** | ⚠️ Limited — no native WS push. Automations are workflow-triggered, not live subscriptions. |
| **FastAPI integration** | ✅ REST data source + PostgreSQL direct connector. |
| **Self-hosting** | ✅ Docker, Kubernetes (Helm chart in repo `charts/budibase`). |
| **Customization** | ⚠️ Component-based builder. Recent focus is AI agents (Slack/Teams/Discord messaging channels) — diverging from traditional admin panel use case. |
| **Franchise-specific** | Less mature than Appsmith for this use case. AI-agent pivot means core admin features may get less attention. |

**Best fit:** If FOFUS wanted AI-agent-driven internal automation, not franchise dashboards.

---

### 4. Retool (retool.com)

**Type:** Low-code internal app builder
**License:** **Functional Source License (NOT OSI-open-source)** — source-visible but usage-restricted
**Self-host:** Kubernetes + Helm (production) or Docker (testing only)

| Criterion | Assessment |
|-----------|------------|
| **Multi-tenancy** | ⚠️ Single-tenant instance per deployment. Multi-tenancy = multiple Retool instances (heavy). |
| **RBAC** | ✅ Strong — but **advanced RBAC, audit logs, SCIM are Enterprise-tier** (paid). Free tier limited to 5 end users. |
| **Realtime** | ⚠️ Polling-based. No native WebSocket subscriptions. |
| **FastAPI integration** | ✅ REST query resource. |
| **Self-hosting** | ⚠️ Kubernetes+Helm required for production — heavy vs existing Vercel/static-file deployment. |
| **Security** | ✅ Self-hosted single-tenant, full data control. |
| **Customization** | ⚠️ JS anywhere, but still within Retool's canvas. |
| **Franchise-specific** | ❌ **Per-user pricing in USD** — expensive for India-based franchise scaling (each partner = a paid seat). Enterprise features behind paywall. |

**Why last:** Not truly open-source, USD per-user pricing doesn't fit India franchise economics, Kubernetes requirement adds ops burden, advanced features paywalled.

---

### 5. Custom React+Vite (current approach)

**Type:** Hand-rolled SPA
**License:** Your code

| Criterion | Assessment |
|-----------|------------|
| **Multi-tenancy** | Manual — pass `franchise_id` in every fetch call. Error-prone at scale. |
| **RBAC** | Manual — `<Protected>` wrappers, route guards. Already partially in `auth.js`. |
| **Realtime** | Manual — WebSocket client, reconnection, subscription management, cache invalidation all from scratch. |
| **FastAPI integration** | ✅ Already integrated. `auth.js` Bearer interceptor works. |
| **Self-hosting** | ✅ Already deployed (Vercel + FastAPI static mount). |
| **Customization** | ✅ Unlimited — but the 3323-line `Dashboard.jsx` monolith is already tech debt. |
| **Franchise-specific** | Everything custom-built. No scaffolding for CRUD tables, forms, filters, pagination. |

**Reality check:** The existing dashboard works for a single partner. Adding a full admin panel + per-franchise views + commission tracking + catalog management + realtime = rewriting `Dashboard.jsx` 3-4x over. The framework cost is zero but the dev time cost is the highest of all options.

---

## Ranked Recommendation

| Rank | Framework | Fit Score | Rationale |
|------|-----------|-----------|-----------|
| **🥇 1** | **Refine** | **9.5/10** | Drops into existing React+Vite stack. Native multitenancy + LiveProvider + AccessControlProvider. MIT license, zero per-user cost. Maps directly to existing FastAPI JWT RBAC. shadcn/ui integration matches modern aesthetic. Deploy to Vercel or self-host. |
| **🥈 2** | **Custom React+Vite** | **6/10** | Already in place, full control. But highest dev time — must build CRUD scaffolding, RBAC guards, realtime subscriptions, table/form libraries from scratch. 3323-line monolith is tech debt. |
| **🥉 3** | **Appsmith** | **5.5/10** | Fast for internal admin views (drag-and-drop). Self-hosted Docker is simple. But no native realtime, no per-tenant isolation in single app, limited custom UX for franchise-facing portal. Best as a **secondary** tool for super-admin-only quick views. |
| **4** | **Budibase** | **4.5/10** | Similar to Appsmith but AI-agent pivot makes it less focused on traditional admin panels. Self-hostable but less mature for multi-tenant franchise model. |
| **5** | **Retool** | **3/10** | Not truly open-source. USD per-user pricing hostile to India franchise scaling. Kubernetes+Helm for prod is heavy. Advanced features paywalled. |

---

## Recommended Implementation: Refine + FastAPI

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Refine App (single codebase, role-based routing)        │
│  Deploy: Vercel → business.fofus.in (admin)               │
│          Vercel → {id}-{slug}.platform.fofus.in (franchise)│
├─────────────────────────────────────────────────────────┤
│  Routes:                                                  │
│  /admin/*      → super_admin (all franchises, commission, │
│                 catalog, RBAC, settings, audit log)        │
│  /franchise/*  → franchise_admin (own territory orders,    │
│                 printers, revenue, filament orders)       │
│  /partner/*    → partner (assigned jobs, Kanban, messages) │
├─────────────────────────────────────────────────────────┤
│  Providers:                                               │
│  ├── authProvider      → wraps FastAPI /auth/login JWT    │
│  ├── dataProvider      → custom REST → /api/v1/*          │
│  ├── liveProvider      → WebSocket → /ws (new FastAPI      │
│  │                       endpoint, Redis pub/sub backend)   │
│  ├── accessProvider    → maps JWT role claims → <CanAccess>│
│  └── notificationProvider → toast/snackbar (shadcn Sonner) │
├─────────────────────────────────────────────────────────┤
│  UI: shadcn/ui (Tailwind + Radix) — modern, matches        │
│       existing dark/light theme in Dashboard.jsx           │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  FastAPI Backend (port 4322, already built)              │
│  ├── /api/v1/auth/*       JWT login (exists)             │
│  ├── /api/v1/farm/*       Orders, printers (exists,       │
│  │                        partner-scoped)                  │
│  ├── /api/v1/admin/users   User CRUD (exists)             │
│  ├── /api/v1/commissions/* NEW — commission tracking      │
│  ├── /api/v1/catalog/*    NEW — centralized product catalog│
│  ├── /api/v1/franchises/* NEW — franchise CRUD + territory │
│  └── /ws                   NEW — WebSocket realtime        │
│                           (Redis pub/sub → printer status, │
│                            order updates, message alerts)  │
└─────────────────────────────────────────────────────────┘
```

### Phase 1 — Foundation (Week 1-2)

1. **Scaffold Refine app** in `dash/admin/` (separate from existing `frontend/`):
   ```bash
   npx superplate-cli dash/admin
   # Select: Refine + React Router + shadcn/ui + Vite
   ```

2. **Custom `dataProvider`** — maps Refine's CRUD verbs to FastAPI REST:
   ```typescript
   // dash/admin/src/providers/dataProvider.ts
   const API = import.meta.env.VITE_API_URL;
   
   export const dataProvider = {
     getList: async ({ resource, pagination, filters, sorters, meta }) => {
       const params = new URLSearchParams();
       params.set('_page', pagination.current);
       params.set('_limit', pagination.pageSize);
       // franchise_id scoping from meta.tenant (set from JWT)
       if (meta?.tenant) params.set('franchise_id', meta.tenant);
       // ... filters, sorters
       const res = await fetch(`${API}/api/v1/${resource}?${params}`, {
         headers: authHeaders(),
       });
       return { data: res.data, total: res.total };
     },
     getOne: async ({ resource, id, meta }) => { /* GET /api/v1/{resource}/{id} */ },
     create: async ({ resource, variables, meta }) => { /* POST */ },
     update: async ({ resource, id, variables }) => { /* PATCH */ },
     deleteOne: async ({ resource, id }) => { /* DELETE */ },
   };
   ```

3. **`authProvider`** — wraps existing `/auth/login`:
   ```typescript
   export const authProvider = {
     login: async ({ email, password }) => {
       const res = await fetch(`${API}/api/v1/auth/login`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, password }),
       });
       const { access_token, role, partner_id, franchise_id } = await res.json();
       localStorage.setItem('pd_token', access_token);
       return { redirectTo: role === 'super_admin' ? '/admin' : '/partner' };
     },
     // check, logout, onError, getIdentity, getPermissions...
   };
   ```

4. **`accessControlProvider`** — maps JWT roles:
   ```typescript
   export const accessControlProvider = {
     can: async ({ resource, action, params }) => {
       const role = getRoleFromJWT();
       // Use existing RBAC Matrix from ARCHITECTURE.md
       return { can: rbacMatrix[role]?.[resource]?.includes(action) };
     },
   };
   ```

### Phase 2 — Realtime (Week 3)

5. **Add WebSocket endpoint to FastAPI:**
   ```python
   # dash/backend/app/api/v1/endpoints/ws.py
   from fastapi import WebSocket, WebSocketDisconnect
   
   @router.websocket("/ws")
   async def websocket_endpoint(ws: WebSocket, token: str = Depends(...)):
       # Verify JWT, extract franchise_id + role
       await ws.accept()
       # Subscribe to Redis channels: orders:{franchise_id}, printers:{franchise_id}
       # Forward pub/sub messages to ws.send_json()
   ```

6. **Custom `liveProvider`** for Refine (~50 lines):
   ```typescript
   export const liveProvider: LiveProvider = {
     subscribe: ({ channel, types, callback }) => {
       const ws = new WebSocket(`${WS_URL}/ws?token=${getToken()}`);
       ws.onmessage = (e) => callback(JSON.parse(e.data));
       return { ws };
     },
     unsubscribe: ({ ws }) => ws.close(),
     publish: async () => {}, // backend is publisher
   };
   ```
   → `useList({ resource: 'orders', liveMode: 'auto' })` auto-refreshes on order changes.

### Phase 3 — Franchise-Specific Features (Week 4-5)

7. **Commission tracking** — new backend endpoints:
   - `GET /api/v1/commissions?franchise_id=X` — per-franchise earnings
   - `GET /api/v1/commissions/summary` — global P&L (super_admin)
   - Refine resource: `useList({ resource: 'commissions' })` with table + filters

8. **Centralized product catalog:**
   - `GET /api/v1/catalog` — read-only for franchises, write for super_admin
   - Refine: `useList` for catalog grid, `useForm` for admin CRUD
   - `<CanAccess resource="catalog" action="create">` gates edit button

9. **Per-franchisee data isolation:**
   - JWT carries `franchise_id` claim
   - `dataProvider.getList` passes `franchise_id` as query param
   - FastAPI `require_franchise_scope()` dependency enforces server-side
   - Refine `meta.tenant` set from `authProvider.getIdentity()`

### Phase 4 — Migration (Week 6)

10. **Migrate existing `Dashboard.jsx` Kanban** into Refine as `/partner/kanban`
11. **Decommission** legacy hardcoded-session auth (flip `AUTH_ENFORCE=true`)
12. **Deploy:** Vercel project `fofus-admin` → `business.fofus.in` (admin) + per-franchise subdomains

### Deployment

```yaml
# Vercel: fofus-admin project
# Build: dash/admin/
# Output: dist/
# Env:
#   VITE_API_URL=https://reventer-b550m-ds3h-ac.tailaf82d9.ts.net
#   VITE_WS_URL=wss://reventer-b550m-ds3h-ac.tailaf82d9.ts.net
# Domains:
#   business.fofus.in         → admin panel (super_admin)
#   101-3ddevine.platform.fofus.in → franchise dashboard (franchise_admin/partner)
```

OR self-hosted (FastAPI serves static files, like existing `frontend/dist` mount):
```python
# main.py addition
ADMIN_DIR = Path(__file__).resolve().parent.parent.parent / "admin" / "dist"
app.mount("/admin", StaticFiles(directory=str(ADMIN_DIR)), name="admin")
```

---

## Why Not the Other Options

**Appsmith as a secondary tool:** If the super-admin needs quick throwaway data views (ad-hoc SQL queries, one-off reports), Appsmith self-hosted on a Docker container alongside the FastAPI backend is a reasonable **complement** — not a replacement. Use it for internal exploration; use Refine for the production admin panel + franchise portal.

**Retool is disqualified** for FOFUS because:
1. Functional Source License ≠ open-source (usage restrictions)
2. Per-user USD pricing doesn't work for India franchise with 50+ partners
3. Kubernetes+Helm for production is unnecessary ops burden
4. Advanced RBAC/audit behind Enterprise paywall

**Budibase** is pivoting to AI agents — its roadmap is diverging from the admin-panel use case.

---

## Cost Comparison (5 franchises, 50 partners, 5 admins)

| Framework | License | Per-User Cost | Annual Cost |
|-----------|---------|---------------|-------------|
| **Refine** | MIT | $0 | **$0** (hosting = existing Vercel free tier) |
| Custom React | Own | $0 | $0 (+ ~200 dev hours rebuilding CRUD) |
| Appsmith | Apache 2.0 | $0 (self-hosted) | $0 (+ 8GB RAM server) |
| Budibase | Open | $0 (self-hosted) | $0 |
| Retool | FSL | $10-50/user/mo (USD) | **$7,000-35,000/yr** |

---

## Final Verdict

**Use Refine.** It's the only option that:
- Fits the existing React+Vite + FastAPI stack without replacing it
- Has native multitenancy + realtime + RBAC provider abstractions
- Is truly open-source (MIT) with zero per-user licensing
- Deploys to existing Vercel infrastructure
- Gives full code control for franchise-specific business logic (commission, catalog, territory isolation)
- Maps directly to the FastAPI JWT RBAC already built (roles, `require_role()`, `partner_id` scoping)

The implementation is ~4-6 weeks for a working admin panel + franchise dashboard, reusing the existing FastAPI backend almost entirely (only new endpoints: `/commissions`, `/catalog`, `/franchises`, `/ws`).