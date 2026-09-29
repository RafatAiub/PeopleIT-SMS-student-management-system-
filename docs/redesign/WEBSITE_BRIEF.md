# Website Builder (Sites) — Engineer Brief

The owner approved a full school-website product: drag-and-drop builder, 10 templates, pages, menus, media, blog, forms, custom domains, live school-data blocks and an AI site generator. The LMS comes in a later wave; leave room for a `courses` block but don't build it.

Everything in `ENGINEER_BRIEF.md` and `WAVE_C_BRIEF.md` still applies: RBAC, tenant isolation, no mock data, demo mode when a key is missing, and never touching `backend/.env` (production). This file adds the Sites contract, so the three engineers can work in parallel.

## Ownership (do not edit outside your area)

| Engineer | Owns |
|---|---|
| **A — Backend** | `backend/prisma/schema.prisma` (Sites models only, additive), a new migration folder, and `backend/src/modules/sites/**` |
| **B — Blocks, templates, renderer** | `frontend/src/site/**` (block library, Puck config, theme system, 10 templates, public renderer) |
| **C — Admin and editor UI** | `frontend/src/pages/website/**` (replaces the old Landing Page Customizer; keep its route `/website-builder`) |

The lead owns `app.ts`, `server.ts`, `App.tsx`, `Sidebar.tsx`, `vite.config.mts` and `main.tsx`. Report the lines you need added.

## Local database (safe)

A local Docker database exists for testing. When a command needs a database, **always** prefix it:

```bash
DATABASE_URL="postgresql://sms_user:sms_pass@localhost:5433/sms_redesign"
```

- Never run a database command without that prefix. `backend/.env` is production.
- Generate migration SQL without any database:
  ```bash
  npx prisma migrate diff --from-schema-datamodel <old copy> --to-schema-datamodel prisma/schema.prisma --script
  ```
- The lead applies migrations to the local database.

## Editor library

Use **Puck** (MIT licence, React). Check npm for the current package name (`@puckeditor/core` or `@measured/puck`) and install it in `frontend`.

- A page is stored as Puck `Data` JSON: `{ root: { props }, content: [ { type, props } ], zones? }`.
- The same `config` renders in both the editor and the public site.

## Data model (Engineer A; exact names)

| Model | Fields |
|---|---|
| `Site` | `id`, `institutionId` (unique; one site per institution for now), `subdomain` (unique; defaults to institution slug), `templateKey`, `theme Json` (`{primary, accent, font, radius, mode}`), `navigation Json` (menus: `header[]`, `footer[]` of `{label, labelBn?, href, children?}`), `settings Json` (`{siteName, logoUrl, faviconUrl, social{}, analyticsId?, defaultLanguage, languages[], liteMode}`), `status` (`DRAFT`/`PUBLISHED`), `publishedAt`, timestamps |
| `SitePage` | `id`, `siteId`, `institutionId`, `slug` (unique per site; `''` = home), `title`, `titleBn?`, `seo Json` (`{title, description, ogImage, noindex}`), `draft Json` (Puck data), `published Json?`, `publishedAt?`, `sortOrder`, `isSystem` (home is undeletable), `scheduledPublishAt?`, timestamps |
| `SitePageVersion` | `id`, `pageId`, `data Json`, `createdByUserId`, `note?`, `createdAt`; keep the last 30 per page |
| `SiteMedia` | `id`, `institutionId`, `url`, `kind` (IMAGE/VIDEO/FILE), `name`, `size?`, `width?`, `height?`, `alt?`, `createdByUserId`, `createdAt`. Uploads go straight from the browser to Cloudinary (already configured through `VITE_CLOUDINARY_*`); the backend only stores metadata |
| `SiteDomain` | `id`, `siteId`, `institutionId`, `hostname` (unique, lowercase), `isPrimary`, `status` (`PENDING_DNS`, `VERIFYING`, `ACTIVE`, `FAILED`), `verificationToken`, `provider` (`vercel`/`cloudflare`/`caddy`/`manual`), `providerRef?`, `lastCheckedAt?`, `error?`, `isDemo`, timestamps |
| `SitePost` | Blog/news: `id`, `siteId`, `institutionId`, `slug`, `title`, `excerpt?`, `coverUrl?`, `body Json` (Puck data or rich text), `status` (DRAFT/PUBLISHED), `publishedAt?`, `authorUserId`, `tags String[]`, timestamps |
| `SiteForm` | `id`, `siteId`, `institutionId`, `name`, `fields Json` (`[{key, label, type, required, options?}]`), `target` (`ENQUIRY`/`INBOX`), `notifyEmails String[]`, timestamps |
| `SiteFormSubmission` | `id`, `formId`, `institutionId`, `data Json`, `ip?`, `userAgent?`, `createdAt`, `readAt?` |

## API contract (Engineer A implements; B and C consume)

**Admin API.** Base `/api/v1/sites`. Roles: SUPER_ADMIN and ADMIN manage; TEACHER may create and edit posts only.

- `GET /me`: the site, creating it lazily. Returns `{ site, pages[], domains[], platformDomain, previewUrl, liveUrl }`.
- `PUT /me`: update theme, navigation, settings and templateKey.
- `POST /me/apply-template` with `{ templateKey, mode: 'replace'|'merge' }`. B sends the template's pages; the backend accepts them in the body as `{ pages: [{slug, title, data}] }` and saves them as drafts.
- `POST /me/publish`: publish the site and every page.
- `POST /me/generate` with `{ tone?, languages? }`: AI site generator. Uses the existing `aiClient` (Claude → Gemini → demo) plus institution data; returns page drafts (`demo: true` when no AI key).
- Pages:
  - `GET/POST /pages`, `GET/PUT/DELETE /pages/:id`
  - `POST /pages/:id/publish`
  - `GET /pages/:id/versions`, `POST /pages/:id/versions/:versionId/restore`
  - `PUT /pages/order`
- Media: `GET/POST /media` (metadata), `DELETE /media/:id`.
- Posts: `GET/POST /posts`, `GET/PUT/DELETE /posts/:id`.
- Forms: `GET/POST /forms`, `PUT/DELETE /forms/:id`, `GET /forms/:id/submissions`.
- Domains:
  - `GET/POST /domains` with `{hostname}`; returns the DNS records to set
  - `POST /domains/:id/verify`, `PUT /domains/:id/primary`, `DELETE /domains/:id`

**Public API.** Base `/api/v1/public/sites`. No authentication; rate-limited; CORS allows any origin (read-only).

- `GET /resolve?host=<hostname>` or `?slug=<subdomain>`: returns `{ site (theme, navigation, settings), institution (name, logo, contact), pages: [{slug, title, titleBn}] }`. Only PUBLISHED data is returned, and 404 if unknown.
- `GET /:siteId/pages/:slug` (use `_home` for the home page): the published Puck data plus SEO. `?preview=<signed token>` returns the draft for editors.
- `GET /:siteId/posts?page&tag`, `GET /:siteId/posts/:slug`
- `POST /:siteId/forms/:formId/submit`: validates against the form's fields; honeypot field `website`; rate-limited. `target=ENQUIRY` creates an `AdmissionEnquiry` through the enquiries service.
- `GET /:siteId/sitemap.xml`, `GET /:siteId/robots.txt`

**Live school-data endpoints.** `GET /:siteId/data/<kind>`. Public-safe fields only: never phones, addresses or student IDs of individuals, except where noted.

| Kind | Returns |
|---|---|
| `notices?limit` | Active notices targeted at everyone/public |
| `events?from&to` | Events and holidays |
| `teachers` | Name, subject, photo, designation |
| `toppers?examId&limit` | First name plus last initial, class, GPA. Only when the admin enables `settings.showToppers` |
| `results-lookup` | POST `{examId, roll/studentId, dob}`; returns one student's published marksheet. Rate-limited, and `settings.publicResults` must be on |
| `routine?class&section` | Class routine |
| `stats` | Students, teachers, classes and years established |
| `fees-link` | Whether online payment is enabled; links to the guardian portal |
| `courses` | Placeholder returning `[]` until the LMS wave |

**Domains: provider adapter.** The adapter lives in `sites/domains/`, with one interface: `add(hostname)`, `status(hostname)`, `remove(hostname)`.

- `vercel`: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`
- `cloudflare`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` (Cloudflare for SaaS custom hostnames)
- `caddy`: exposes `GET /api/v1/public/sites/caddy-ask?domain=` (200 only for a verified hostname)
- `manual`/demo: no key. DNS is checked with Node `dns.promises` (`CNAME` to `PLATFORM_SITE_DOMAIN`, or the `TXT _peoplenit-verify.<host>` token); the domain is marked ACTIVE with `isDemo = true` and the UI says SSL must be set up by the operator.
- `SITES_DOMAIN_PROVIDER` picks the provider. The default is `manual`.
- `PLATFORM_SITE_DOMAIN` is the root for free subdomains (for example `peoplenit.app`); empty means path-based preview only.
- Refuse the platform's own hostnames. Validate the hostname format. Re-check pending domains every 10 minutes with an in-process job (`startDomainCheckJob`/`stopDomainCheckJob`, like the other schedulers).

## Public rendering (Engineer B)

- **Path-based preview:** `/s/:subdomain/*`, always available.
- **Host-based:** when `window.location.hostname` is not an app host, render the public site for that host. App hosts are localhost, 127.0.0.1, `*.trycloudflare.com`, `peopleitsms.vercel.app` and `VITE_APP_HOSTS` (comma-separated). A subdomain of `VITE_PLATFORM_SITE_DOMAIN` resolves by subdomain.
- **Export shape:** `frontend/src/site/PublicSite.tsx` exports `PublicSiteRoutes` (for the path route) and `isSiteHost(hostname)` / `SiteHostApp` (for the host-based mode). The lead wires both into `App.tsx`.
- **SEO:** set `document.title`, meta description, OG tags and `hreflang` per page. Server-side rendering on Vercel is a later deployment step; document it, don't build it.
- **Lite mode** (`settings.liteMode`): no animations, lazy images, system fonts, minimal JavaScript per block.
- **Theming:** the theme maps to CSS variables scoped to `.site-root`. It must not leak into the dashboard.
- **Accessibility and devices:** WCAG AA; works at 360px wide.

## Block library (Engineer B; `frontend/src/site/blocks/**`, registered in `frontend/src/site/config.tsx` exporting `siteConfig` and `BLOCK_CATEGORIES`)

- **Layout:** Section (background, padding, width), Columns (2/3/4 with drop zones), Spacer, Divider.
- **Content:** Hero (title, subtitle, CTA buttons, background image/video, overlay), Heading, RichText, Image, Gallery (grid/carousel), Video (YouTube/Vimeo/URL), Button group, Cards, Stats counter, Testimonials, FAQ accordion, Logo strip, Map (OpenStreetMap iframe), Embed/HTML (sanitised; iframe allow-list), Call to action, Contact info, Timeline/History, Principal's message.
- **Live data** (fetch from the public data endpoints; editor shows a live preview):
  - Notices, Events calendar, Teacher directory, Toppers/Merit, Results lookup form, Class routine, Stats (live), Admission enquiry form (uses a `SiteForm` or the default enquiry), Online fee payment link, Latest news (posts), Courses (placeholder "Coming soon"), AI assistant chat widget (reuses the admission assistant: `/ai/admission-assistant`).
- **Every text prop** has an optional Bangla twin (`textBn`); the renderer picks by language toggle.

## Templates (Engineer B; `frontend/src/site/templates/*.ts`)

Ten templates. Each has `key`, name, nameBn, description, preview (gradient or SVG thumbnail; no external images needed), theme, navigation, and pages (Home, About, Admissions, Academics, Notices, Contact, plus any template-specific pages) as Puck data using the blocks above.

| Key | Template |
|---|---|
| `modern-campus` | Modern Campus |
| `classic-heritage` | Classic Heritage |
| `kindergarten` | Kindergarten Playful |
| `english-medium` | English-Medium International |
| `madrasa` | Madrasa (Arabic-script accent) |
| `college` | College |
| `coaching` | Coaching Centre |
| `polytechnic` | Polytechnic/Technical |
| `minimal` | One-page Minimal |
| `academy` | Academy (course-sales focused) |

- Placeholder copy must read as **template sample text** that the school replaces; use `{{institution.name}}`-style tokens that the renderer fills from real data. Never invent fake facts about the school.

## Admin UI (Engineer C; `frontend/src/pages/website/**`)

Tabs on `/website-builder`: Overview, Pages, Design, Navigation, Media, Blog, Forms, Domains, Settings.

| Tab | Contents |
|---|---|
| Overview | Status, live link, preview link, publish button, quick stats, "Generate with AI" |
| Pages | List, add, reorder; open the editor at `/website-builder/pages/:id` (full-screen Puck with the block palette grouped by `BLOCK_CATEGORIES`, desktop/tablet/mobile viewports, English/Bangla toggle, save draft, publish, version history drawer with restore, SEO panel) |
| Design | Template gallery (apply, with a confirm dialog explaining replace vs merge); theme editor (colours with an AA contrast warning, font, radius) |
| Navigation | Header and footer menu editor (drag to reorder, nested items) |
| Media | Library with a Cloudinary upload widget and an alt-text requirement |
| Blog | Post list and editor |
| Forms | Form builder and submissions inbox |
| Domains | Add a domain, then a step-by-step DNS card (records, copy buttons, status badge, verify button, "demo/manual SSL" notice) |
| Settings | Site name, logo, favicon, social links, languages, lite mode, public results, show toppers, analytics ID |

## Tests and verification

- **Pure-logic unit tests:** hostname validation, DNS check logic, template token filling, sanitiser, Puck data validation.
- **Typecheck and lint:** `npx tsc --noEmit -p .` with 0 errors in your area, and eslint with 0 errors.
- **Final report:** files, endpoints, the lines the lead must add (mounts, routes, sidebar, jobs), environment variables, demo mode, and anything left incomplete.
