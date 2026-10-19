# Facility Management — Backend API

Node.js + Express 5 + Mongoose + MongoDB REST API for the Facility Service
Management & Work Tracking Platform (see `../Readme/README_BRD.md` for the
full product brief).

## Roles

Four login roles, enforced end-to-end (JWT + route-level RBAC + query-level data scoping):

| Role | Logs into | Scope |
|---|---|---|
| `admin` | Admin Web Panel | Everything within their enterprise |
| `user` | Client App | Only their own client's data (`clientId`) |
| `supervisor` | Enterprise App | Only their assigned sites (`assignedSiteIds`) |
| `site_manager` | Enterprise App | Only their assigned sites (`assignedSiteIds`) |

Only `admin` creates `admin` / `supervisor` / `site_manager` accounts (via
`POST /api/accounts`). A `user` (client) account is always created alongside
a Client record (`POST /api/clients`), never on its own.

Field technicians (Electrician, Plumber, Housekeeper, ...) live in the
`Employee` directory too, but **without a login** — they're assignable on
work orders/complaints but don't sign into anything, matching the roles above.

## Getting started

```bash
npm install
cp .env.example .env      # already done for you in this repo
npm run dev:memory        # instant — boots an in-process MongoDB, no install needed
# or, against a real MongoDB (local install or Atlas):
npm run seed               # one-time: creates the enterprise + admin + default services
npm run seed:products      # product catalogue (~160, with images), service packages, delivery hub
                           #   add `-- --demo` to also price 2 open work orders + 2 shop orders for the demo client
npm run dev
```

Seeded admin login (from `.env`): `admin@teamgenix.in` / `Admin@12345`.

> `dev:memory` uses `mongodb-memory-server` — data does **not** persist across
> restarts. It auto-seeds on every boot so it's always immediately usable.
> For real, persistent data, set `MONGODB_URI` in `.env` to your own MongoDB
> and use `npm run dev` + `npm run seed` (once).

## Auth flow

- `POST /api/auth/login` → `{ user, accessToken, refreshToken }` (refresh
  token also set as an httpOnly cookie, scoped to `/api/auth`).
- Send `Authorization: Bearer <accessToken>` on every other request.
- Access tokens are short-lived (15m default). `POST /api/auth/refresh` with
  the refresh token (body or cookie) rotates it and returns a new pair.
- `POST /api/auth/logout` revokes one session; `POST /api/auth/logout-all`
  revokes every refresh token for the account (also triggered automatically
  on password change or deactivation).

## Response shape

Every response is `{ success, statusCode, message, data, meta? }`. List
endpoints include `meta: { page, limit, total, pageCount }`.

## Endpoints

All routes are prefixed `/api`. 🔒 = requires `Authorization: Bearer` header.

### Auth (`/auth`)
| Method & path | Role | Notes |
|---|---|---|
| POST `/auth/login` | — | `{ email, password }`, or `{ identifier, password }` where identifier is an email or registered mobile (client app) |
| POST `/auth/refresh` | — | rotates the refresh token |
| POST `/auth/logout` | — | |
| POST `/auth/logout-all` | 🔒 any | revoke all sessions |
| GET `/auth/me` | 🔒 any | |
| POST `/auth/change-password` | 🔒 any | revokes all other sessions |

### Accounts (`/accounts`) — admin/supervisor/site_manager logins
| Method & path | Role |
|---|---|
| POST `/accounts` | admin |
| GET `/accounts` | admin |
| GET `/accounts/:id` | admin |
| PATCH `/accounts/:id` | admin |
| PATCH `/accounts/:id/status` | admin |
| POST `/accounts/:id/reset-password` | admin |

### Clients (`/clients`)
| Method & path | Role |
|---|---|
| POST `/clients` | admin — optionally auto-creates the client's `user` login |
| GET `/clients` | admin, supervisor, site_manager |
| GET `/clients/:id` | admin, supervisor, site_manager, user (self only) |
| PATCH `/clients/:id` | admin |
| PATCH `/clients/:id/status` | admin |
| PATCH `/clients/:id/services` | admin |
| POST `/clients/:id/reset-password` | admin |

### Sites (`/sites`)
| Method & path | Role |
|---|---|
| POST `/sites` | admin |
| GET `/sites`, GET `/sites/:id` | any (auto-scoped) |
| GET `/sites/:id/services-summary` | any (auto-scoped) — per-service work/complaint counts, deployed staff, finished-work history (client app "My Services") |
| PATCH `/sites/:id`, PATCH `/sites/:id/services` | admin |

### Services (`/services`)
| Method & path | Role |
|---|---|
| GET `/services/categories` | any — returns categories with nested `types` |
| POST `/services/categories`, PATCH `/services/categories/:id` | admin |
| POST `/services/types`, PATCH `/services/types/:id` | admin |

### Employees (`/employees`) — staff directory, no login
| Method & path | Role |
|---|---|
| POST `/employees` | admin |
| GET `/employees`, GET `/employees/:id` | admin, supervisor, site_manager (auto-scoped) |
| PATCH `/employees/:id`, PATCH `/employees/:id/status` | admin |

### Work Orders (`/work-orders`)
| Method & path | Role |
|---|---|
| POST `/work-orders` | admin (optionally `fromComplaintId`) |
| GET `/work-orders`, GET `/work-orders/:id` | any (auto-scoped) |
| PATCH `/work-orders/:id` | admin |
| PATCH `/work-orders/:id/reassign` | admin |
| PATCH `/work-orders/:id/priority` | admin |
| PATCH `/work-orders/:id/cancel` | admin — requires `reason` |
| PATCH `/work-orders/:id/override-status` | admin — requires `reason`, logged |
| PATCH `/work-orders/:id/status` | admin, supervisor, site_manager — normal lifecycle progression |
| POST `/work-orders/:id/updates` | admin, supervisor, site_manager — progress note |
| PATCH `/work-orders/:id/client-approve` | user — client signs off on `verified` work, closing it |

Every status change is appended to the work order's `statusHistory`, which
the client app renders as its timeline.

### Complaints (`/complaints`)
| Method & path | Role |
|---|---|
| POST `/complaints` | any — `user` role always raises against their own client |
| GET `/complaints`, GET `/complaints/:id` | any (auto-scoped) |
| PATCH `/complaints/:id/assign` | admin, supervisor, site_manager (auto-scoped) |
| PATCH `/complaints/:id/status` | any (user role limited to confirming/closing a resolved complaint) |
| PATCH `/complaints/:id/reopen` | user — `{ reason }`, sends a resolved complaint back into the queue |

Complaints carry a `history` activity feed, accept an optional `workOrderId`
on create (the client app's "Raise concern"), and list/detail responses
include `workOrderCode` alongside the raw `workOrderId`.

### Site Visits (`/site-visits`) — enterprise-app check-in/out
| Method & path | Role |
|---|---|
| POST `/site-visits` | supervisor, site_manager — check-in to one of their assigned sites |
| PATCH `/site-visits/:id/check-out` | supervisor, site_manager |
| GET `/site-visits`, GET `/site-visits/:id` | any (auto-scoped) |

### Media (`/media`)
| Method & path | Role |
|---|---|
| POST `/media` (multipart, field `file`) | admin, supervisor, site_manager |
| GET `/media`, GET `/media/:id` | any (auto-scoped) |
| DELETE `/media/:id` | admin |

### Notifications (`/notifications`)
GET `/`, PATCH `/:id/read`, PATCH `/read-all` — 🔒 any, always scoped to the caller.

Generated automatically by `utils/notifier.js` (never fails the request):
clients hear about their work orders (created, started, progress notes,
completed, verified, closed/cancelled), complaints (assigned, status,
resolved) and site-visit check-outs; admins and the site's supervisors hear
about new/reopened complaints and client approvals; a site's supervisors are
told when work there is submitted for verification. Each carries a `kind`
plus a finer `event` for the mobile apps' icons.

### Activity Logs (`/activity-logs`)
GET `/` — 🔒 admin only. Append-only audit trail; every mutation above writes here automatically.

### Dashboard (`/dashboard`) — 🔒 admin only
GET `/stats`, GET `/attention`, GET `/recent-activity`, GET `/trends`

### Reports (`/reports`) — 🔒 admin only
GET `/work`, `/service`, `/employee`, `/complaint`, `/client` (filters: `clientId`, `dateFrom`, `dateTo`).
GET `/:type/export?format=xlsx|pdf` downloads the same report as Excel or PDF.

### Documents (`/documents`)
Client files (agreements, AMC, invoices, certificates). Admin: upload (multipart `file`), PATCH, DELETE.
Client users list/read only documents marked `visibleToClient`.

### Attendance (`/attendance`)
| Method & path | Role |
|---|---|
| GET `/me`, POST `/clock-in`, POST `/clock-out` | supervisor, site_manager — own day, geofenced like site check-in |
| GET `/roster?siteId&date` | admin; supervisors for their sites — the marking sheet |
| PUT `/mark` | admin; supervisors for their own team (not future dates) |
| GET `/` | admin; supervisors see their team — `meta.summary` has per-status counts |

### Assets (`/assets`)
Equipment per site with a lifecycle `history` (installation → maintenance → complaint → repair → replacement).
Admin: CRUD; supervisors: POST `/:id/history`; everyone reads within scope. Work orders and
complaints accept an optional `assetId`, which adds a history entry automatically.

### Contracts (`/contracts`) & preventive maintenance (`/pm-schedules`)
AMC/service agreements with a derived `state` (upcoming/active/expiring/expired/cancelled) and
POST `/:id/renew`. PM schedules repeat every N days/weeks/months/years; the scheduler creates each
work order `leadDays` before it is due (POST `/:id/generate` does it immediately).

### Quotations (`/quotations`) & Invoices (`/invoices`)
Line items with GST; totals are computed server-side. Quotation: draft → send → client accepts/rejects
(POST `/:id/respond`) → POST `/:id/invoice`. Invoice: draft → issue → POST `/:id/payments`.
GET `/:id/pdf` renders the document; GET `/:id/pdf-link` returns a 10-minute signed URL for the apps.
Clients only see sent quotations and issued invoices.

### Background jobs
`services/scheduler.service.js` runs every `SCHEDULER_INTERVAL_MINUTES` (default 5, `0` disables):
preventive-maintenance work orders, complaint SLA breach alerts (targets in Settings → Operations & SLA),
overdue work-order alerts and contract-renewal alerts. Each job stamps what it handled, so it alerts once.
Calendar days (attendance) use `APP_TIMEZONE` (default `Asia/Kolkata`).

## Architecture notes

- **Multi-tenant from day one** (BRD §9): every document carries an
  `enterpriseId`; queries always filter by the caller's own enterprise.
- **Data scoping, not just UI hiding**: `scope.middleware.js` computes each
  request's boundary (own client / own assigned sites) and controllers merge
  it into their Mongo filters — a supervisor's query literally cannot return
  another site's rows.
- **Refresh tokens** are stored hashed with a `jti` nonce (never as plaintext,
  never colliding even when issued in the same second) and rotate on every use.
- **Media storage**: only metadata + a URL live in MongoDB; files go to local
  disk in dev (`uploads/`, served at `/uploads/...`) or to S3 / Cloudflare R2 with
  `STORAGE_DRIVER=s3` (see `services/storage.service.js`).
- **Activity log** is append-only; `utils/activityLogger.js` is called from
  controllers after a mutation succeeds and never throws into the request.
- **Human-friendly codes** (`WO-10245`, `CMP-5100`, `SV-7300`, `EMP-1000`, `AST-`, `CT-`,
  `PM-`, `QT-`, `INV-`) are reserved atomically per-enterprise via `utils/sequence.js` + a `Counter` collection.

## What's not built yet

- Phase 3 (SaaS): super-admin panel, multi-enterprise onboarding, subscriptions, WhatsApp automation, AI features.
- Bengali (i18n) is a frontend concern, not modeled here.
