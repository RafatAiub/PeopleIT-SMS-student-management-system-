# Website Builder v2 — Custom Code, Shop, Courses (LMS), Landing Pages

The owner asked for a builder that is not limited to fixed blocks: custom HTML/CSS/JS, an e-commerce shop, a course platform (LMS) and beautiful landing pages. This brief extends `WEBSITE_BRIEF.md`; every rule there still applies (RBAC, tenant isolation, additive schema only, no mock data, demo mode when a key is missing, **never** touch `backend/.env` — use the local Docker DB prefix).

## Ownership (same split as v1)

| Engineer | Owns |
|---|---|
| **A — Backend** | `backend/prisma/schema.prisma` (new Sites models only, additive), one new migration folder `20260929000000_sites_commerce_lms`, `backend/src/modules/sites/**`, new tests in `backend/tests/sites-commerce-*.test.ts` |
| **B — Site renderer, blocks, templates** | `frontend/src/site/**` |
| **C — Admin and editor UI** | `frontend/src/pages/website/**` |

The lead owns `app.ts`, `App.tsx`, `main.tsx`, `Sidebar.tsx`, `package.json` installs are allowed in `frontend` for B (CodeMirror). Report lines you need elsewhere.

## 1. Security rule for custom code (all engineers)

Admin auth tokens live in `localStorage` on the app origin, and path-mode sites (`/s/:subdomain`) share that origin. **User-written JavaScript must never execute in the app's origin.**

- Every custom HTML/CSS/JS runs in a **sandboxed iframe**: `srcdoc`, `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation"` and **never** `allow-same-origin`. The frame has an opaque origin, so it can't read tokens, cookies or the parent DOM.
- Site-wide `customCss` is injected as a `<style>` into the site page (CSS cannot run script). It is inserted only inside the public site / editor preview and removed on unmount.
- Site-wide `headHtml` / `bodyEndHtml` (tracking pixels, chat widgets) are **executed only in host mode on a non-app host** (`isSiteHost()` true: custom domain or platform subdomain). In path mode and in the editor they are skipped, and the admin UI says so.
- Custom JS talks to the platform through `postMessage` only (see §3 bridge) and through the public API (CORS already allows any origin; the backend must also accept `Origin: null` on `/api/v1/public/sites/*` — it does today because `origin: true` reflects it; keep it that way).

## 2. Data model (Engineer A; exact names)

Money is `Decimal @db.Decimal(12, 2)`; the API returns numbers.

| Model | Fields |
|---|---|
| `SiteProduct` | `id`, `siteId`, `institutionId`, `slug` (unique per site), `name`, `nameBn?`, `description String @db.Text` (sanitised HTML, may be `''`), `images String[]`, `price`, `compareAtPrice?`, `sku?`, `stock Int?` (null = unlimited), `category?`, `kind SiteProductKind` (`PHYSICAL`/`DIGITAL`), `digitalUrl?` (never public; revealed only on a PAID order), `status SiteStatus` (DRAFT/PUBLISHED), `sortOrder`, timestamps |
| `SiteCourse` | `id`, `siteId`, `institutionId`, `slug` (unique per site), `title`, `titleBn?`, `summary?`, `description @db.Text`, `coverUrl?`, `price` (0 = free), `compareAtPrice?`, `level?`, `language?`, `category?`, `instructorName?`, `instructorBio?`, `instructorPhoto?`, `durationText?`, `status SiteStatus`, `sortOrder`, timestamps |
| `SiteCourseLesson` | `id`, `courseId` (cascade), `institutionId`, `module?` (module/section title; lessons with the same module are grouped), `title`, `kind SiteLessonKind` (`VIDEO`/`TEXT`/`FILE`/`EMBED`), `videoUrl?`, `body @db.Text?` (HTML), `fileUrl?`, `durationMin Int?`, `isFreePreview Boolean @default(false)`, `sortOrder`, timestamps |
| `SiteCustomer` | Shop buyer and course learner account, **per site**: `id`, `siteId`, `institutionId`, `email` (lowercase; `@@unique([siteId, email])`), `name`, `phone?`, `passwordHash`, `lastLoginAt?`, timestamps |
| `SiteOrder` | `id`, `siteId`, `institutionId`, `orderNo` (unique, e.g. `SO-260929-7K3F`), `customerId?`, `customerName`, `email`, `phone`, `address Json?` (`{line1, city, area?, postcode?}`), `items Json` (`[{kind:'PRODUCT'|'COURSE', refId, name, unitPrice, qty}]` — snapshot, priced by the server), `subtotal`, `shipping`, `total`, `currency` (default `BDT`), `status SiteOrderStatus` (`PENDING`, `PAID`, `FULFILLED`, `CANCELLED`, `REFUNDED`), `paymentMethod` (`COD`, `BKASH`, `NAGAD`, `SSLCOMMERZ`, `FREE`), `gatewayTranId? @unique`, `gatewayRef? @unique`, `isDemo Boolean`, `returnUrl?`, `paidAt?`, `note?`, `adminNote?`, timestamps |
| `SiteEnrollment` | `id`, `siteId`, `courseId` (cascade), `customerId` (cascade), `institutionId`, `orderId?`, `status` (`ACTIVE`/`REVOKED`), `createdAt`; `@@unique([courseId, customerId])` |
| `SiteLessonProgress` | `id`, `enrollmentId` (cascade), `lessonId` (cascade), `completedAt`; `@@unique([enrollmentId, lessonId])` |

**`Site.settings` additions** (JSON, no migration; extend `UpdateSiteDto`, all optional):

```ts
customCss?: string            // max 100 KB
headHtml?: string             // max 50 KB, host mode only
bodyEndHtml?: string          // max 50 KB, host mode only
shop?: { enabled: boolean; currency: 'BDT'; shippingFee: number; freeShippingOver?: number | null;
         codEnabled: boolean; notifyEmails: string[]; termsUrl?: string }
courses?: { enabled: boolean }
```

**Page code mode** (no schema change; lives in the Puck data root): `data.root.props = { mode: 'code', code: { html, css, js }, chrome: 'full' | 'none' }`. `content` is `[]`. Visual pages have no `mode` (or `'visual'`). Page data may reach 1 MB; make sure `UpdatePageDto` accepts it.

**Reserved slugs** — pages cannot use: `blog`, `shop`, `cart`, `checkout`, `order`, `courses`, `learn`, `account`. Validate on create/update (400 with a clear message).

## 3. API contract (A implements; B and C consume)

All responses use the existing `{ success, data }` envelope.

### Admin — `/api/v1/sites` (SUPER_ADMIN, ADMIN)

- Products: `GET /products?status&q&category&page&pageSize`, `POST /products`, `GET/PUT/DELETE /products/:id`. Slug auto-derived from name when omitted; unique per site.
- Courses: `GET /courses?status&q&page`, `POST /courses`, `GET /courses/:id` (includes `lessons[]` ordered and `enrollmentCount`), `PUT/DELETE /courses/:id`.
- Lessons: `POST /courses/:id/lessons`, `PUT/DELETE /courses/:id/lessons/:lessonId`, `PUT /courses/:id/lessons/order` `{ ids[] }`.
- Enrollments: `GET /courses/:id/enrollments?page` (customer name/email, progress %, createdAt), `POST /courses/:id/enrollments` `{ email, name? }` (grant access; creates the customer without a usable password if needed — they set one via register with the same email, which then claims the account), `DELETE /enrollments/:id` (sets REVOKED).
- Orders: `GET /orders?status&q&page` , `GET /orders/:id`, `PUT /orders/:id` `{ status?, adminNote? }` (valid transitions only; CANCELLED/REFUNDED revoke course enrollments from that order and restock products).
- Customers: `GET /customers?q&page` (with order count, enrollment count).
- `GET /commerce/summary` → `{ products, publishedProducts, courses, publishedCourses, ordersPending, ordersPaid30d, revenue30d, customers, enrollments, gateways: [{gateway,label,live,demo,available}] }`.

### Public — `/api/v1/public/sites/:siteId` (no staff auth)

Catalogue (only PUBLISHED; `?preview=<token>` shows drafts like pages do):
- `GET /products?category&q&page&pageSize` → `Paged<PublicProduct>`; `GET /products/:slug`. Never returns `digitalUrl`.
- `GET /courses?category&q&page&pageSize` → `Paged<PublicCourse>`; `GET /courses/:slug` → course + `curriculum: [{ id, module, title, kind, durationMin, isFreePreview }]` + `lessonCount` + `totalMinutes`. Lesson content is included only for `isFreePreview` lessons (`preview: { videoUrl?, body?, fileUrl? }`).
- `GET /data/courses?limit` now returns real published courses (was `[]`).
- `GET /checkout/options` → `{ shopEnabled, coursesEnabled, currency, shippingFee, freeShippingOver, codEnabled, gateways: [{ gateway, label, live, demo }] }` (only available gateways).

Customer account (rate-limited; `Authorization: Bearer <siteToken>`):
- `POST /account/register` `{ name, email, password (min 8), phone? }` → `{ token, customer }`. If the email exists **without** a password (granted by an admin), this sets the password and claims it; otherwise 409.
- `POST /account/login` `{ email, password }` → `{ token, customer }`. Generic "invalid email or password".
- `GET /account/me`, `GET /account/orders`, `GET /account/courses` (enrolled courses with `progress` 0–100 and `nextLessonId`).
- Token: JWT HS256 signed with a key **derived** from `JWT_ACCESS_SECRET` (`HMAC(JWT_ACCESS_SECRET, 'site-customer')`), `aud: 'site-customer'`, `sub: customerId`, `sid: siteId`, 30 days. The staff `authenticate` middleware must reject it (it will, because the key differs) — add a test for that. A token for site X is refused by site Y.

Orders and payment:
- `POST /orders` `{ items: [{ kind, refId, qty }], customer: { name, email, phone, address? }, paymentMethod, note?, returnUrl }`. Bearer optional, **required** when any COURSE item is present (enrollment needs an account). The server prices every line from the DB, rejects unpublished/out-of-stock items, applies shipping (only when a PHYSICAL item exists; free over `freeShippingOver`), COURSE qty is always 1, and refuses a course already owned. `returnUrl` must be an https/http URL whose host is one of the site's ACTIVE domains, the platform subdomain, or `FRONTEND_URL`'s host; otherwise it falls back to `${FRONTEND_URL}/s/<subdomain>`.
  - total 0 → `FREE`, PAID immediately.
  - `COD` → PENDING (only for orders without COURSE items and when `codEnabled`).
  - gateway → reuse the fee adapters (`backend/src/modules/fees/gateways/*`) with a new callback base `${API_URL}/api/v1/public/sites/pay/<gateway>`; live → `{ paymentUrl }`; demo → `{ demo: true }` and the site shows its own simulated checkout.
  - Response: `{ order: PublicOrder, paymentUrl?, demo? }`.
- `GET /orders/:orderNo?email=` → `PublicOrder` (email must match, or a Bearer token of the owning customer). PAID DIGITAL items include `downloadUrl`; COURSE items include `courseSlug`.
- `POST /orders/:orderNo/demo-pay` `{ email, outcome: 'success' | 'fail' }` — only when `order.isDemo` and `isDemoPaymentsAllowed()`.
- Gateway callbacks: `/api/v1/public/sites/pay/:gateway/(success|fail|cancel|ipn)` (GET and POST). Re-verify with the gateway, check amount and tranId (`decideVerification`), then credit **idempotently** (atomic `updateMany where status = PENDING` claim inside one transaction that also decrements stock and creates enrollments). Redirect to `${order.returnUrl}/order/<orderNo>?email=…&payment=<status>`.
- On PAID: create `SiteEnrollment` for every COURSE item; email `settings.shop.notifyEmails` and the buyer through the existing notification/email service if one fits; skip quietly (log) when email is disabled.

Learning (Bearer required, enrollment ACTIVE):
- `POST /courses/:slug/enroll` — free courses only (price 0).
- `GET /learn/:courseSlug` → course + full curriculum with lesson content + `completedLessonIds[]` + `progress`.
- `POST /learn/:courseSlug/lessons/:lessonId/complete` and `DELETE` (un-complete) → `{ progress }`.

Rate limits: register/login 10 per 15 min per IP; orders 20 per 15 min; demo-pay 20 per 15 min.

### Public shapes (B mirrors these in `frontend/src/site/types.ts`)

```ts
PublicProduct { id, slug, name, nameBn?, description, images: string[], price, compareAtPrice?, currency,
                kind: 'PHYSICAL' | 'DIGITAL', inStock: boolean, stock?: number | null, category? }
PublicCourse  { id, slug, title, titleBn?, summary?, description, coverUrl?, price, compareAtPrice?, currency,
                level?, language?, category?, instructorName?, instructorBio?, instructorPhoto?, durationText?,
                lessonCount, totalMinutes }
PublicOrder   { orderNo, status, paymentMethod, isDemo, currency, subtotal, shipping, total, createdAt, paidAt?,
                customerName, email, items: [{ kind, refId, name, unitPrice, qty, downloadUrl?, courseSlug? }] }
SiteCustomer  { id, name, email, phone? }
```

## 4. Renderer, blocks and templates (Engineer B — `frontend/src/site/**`)

**Sandboxed code.** `frontend/src/site/code/SandboxFrame.tsx`: renders `{ html, css, js }` into an iframe per §1. It injects a base stylesheet with the theme CSS variables (same names as `.site-root`), the site fonts, and a bridge script that (a) posts its height to the parent for auto-height, (b) exposes `window.SITE = { siteId, apiBase, lang, basePath, institution: { name } }`, (c) offers `SITE.navigate(path)`, `SITE.addToCart(productSlug, qty)` and `SITE.openCart()` via `postMessage`. The parent validates `event.source === iframe.contentWindow` before acting. Props: `height: 'auto' | number`, `title`.

**Blocks** (register in `config.tsx`, new categories `design`, `commerce`, `code`):
- Code: `CustomCode` (html/css/js fields using a CodeMirror field, height auto/fixed, full-bleed toggle). `frontend/src/site/fields/CodeField.tsx` exports a Puck custom field wrapper plus `CodeEditor` (lazy CodeMirror 6: `@uiw/react-codemirror`, `@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-javascript`) that C reuses.
- Design (landing pages): `FeatureGrid`, `PricingTable`, `Steps`, `Team`, `BentoGrid`, `Countdown`, `Newsletter` (posts to a SiteForm or the default enquiry form), `Tabs`, `Marquee`, `ComparisonTable`, `SplitHero` (image/video side, badges, gradient), `GradientBanner`, `TestimonialWall`, `AnnouncementBar`. They must look designed: real spacing scale, soft shadows, gradients from theme colours, hover states, and entrance animation that respects `prefers-reduced-motion` and lite mode.
- Advanced props on `Section`: background gradient (two theme-derived stops or custom), background image with overlay, custom CSS class, entrance animation.
- Commerce: `ProductGrid` (category, limit, columns, show add-to-cart), `FeaturedProduct`, `CartButton`, `CourseGrid`, `FeaturedCourse`, `AccountButton`. Replace the old `Courses` placeholder render with the real `CourseGrid` behaviour but keep the `Courses` type key so old pages keep working.

**Public routes** (in `PublicSite.tsx`): `/shop`, `/shop/:slug`, `/cart`, `/checkout`, `/order/:orderNo`, `/courses`, `/courses/:slug`, `/learn`, `/learn/:courseSlug/:lessonId?`, `/account` (login / register / orders). A page with `root.props.mode === 'code'` renders a full-width `SandboxFrame` (with or without header/footer by `chrome`). Cart lives in `localStorage` under `site-cart:<siteId>` (try/catch). The header shows a cart icon when `settings.shop.enabled` and an account link when `settings.courses.enabled`. Site-wide `customCss`/`headHtml`/`bodyEndHtml` per §1. Demo checkout page clearly labelled "Demo payment — no money moves".

**Learner player**: curriculum sidebar grouped by module, video (YouTube/Vimeo/file via `toVideoEmbed`), sanitised text lessons, file download, mark complete, progress bar, next/previous, works at 360 px.

**Templates** (5 new, same format as v1): `online-store` (shop-first school store: uniforms, books), `lms-academy` (course catalogue + learner journey), `saas-landing` (modern product/landing page), `event-landing` (event / admission fair with countdown), `course-launch` (single-course sales page). Each must look premium out of the box and use the new blocks. Keep template copy as sample text.

`api.ts` gains typed calls for every public endpoint in §3 plus customer-token storage (`site-customer:<siteId>` in `localStorage`, try/catch).

## 5. Admin UI (Engineer C — `frontend/src/pages/website/**`)

New tabs on `/website-builder`: **Shop**, **Courses**, **Code**. (Order: Overview, Pages, Design, Navigation, Shop, Courses, Media, Blog, Forms, Code, Domains, Settings.)

| Tab | Contents |
|---|---|
| Shop | Sub-views: Products (table + editor drawer: name/Bn, slug, price, compare-at, stock, SKU, category, kind, digital URL, images via MediaPicker, rich description, publish toggle), Orders (filter by status, detail drawer, status transitions, admin note), Customers, Settings (enable shop, shipping fee, free-shipping threshold, COD, notify emails; gateway live/demo badges from `/commerce/summary`) |
| Courses | Course list; course editor page/drawer (details, pricing, instructor, cover); curriculum builder (modules, lessons, drag to reorder, lesson editor by kind, free-preview toggle); Enrollments list with "Grant access" and revoke; enable-courses switch |
| Code | Site-wide Custom CSS, Head HTML, Body-end HTML using B's `CodeEditor`; warning that head/body scripts run only on the live domain/subdomain and must be trusted |

Pages tab: "New page" asks **Visual (blocks)** or **Code (HTML/CSS/JS)**, plus a "Blank landing page" starter. Opening a code page at `/website-builder/pages/:id` shows `CodePageEditor`: HTML / CSS / JS editor tabs (B's `CodeEditor`), live preview with B's `SandboxFrame` (debounced), desktop/tablet/mobile, header/footer toggle (`chrome`), and the same save draft / publish / versions / SEO controls the visual editor uses. Overview tab shows shop/course stats from `/commerce/summary`.

## 6. Done means

- Backend: `npx tsc --noEmit -p .` 0 errors; new pure-logic tests (pricing and shipping, order status transitions, returnUrl validation, reserved slugs, customer token audience/site checks, idempotent credit decision) pass; migration SQL generated with `prisma migrate diff` (no DB).
- Frontend: `npx tsc --noEmit -p .` 0 errors in your area, eslint 0 errors; unit tests for cart maths, sandbox srcdoc builder (no `allow-same-origin`, bridge present) and route parsing.
- Final report: files, endpoints, lines the lead must add, env vars, demo mode, anything incomplete.
