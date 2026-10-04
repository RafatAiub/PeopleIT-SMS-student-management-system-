# Feature Plan v4 — Dynamic Website Builder, AI Lesson Builder, Cameras & Face Attendance

Owner: lead engineer / BA · 2026-10-03 · Status: **plan for owner approval** (nothing built yet).
Sizes are working days for one engineer. Runs **after** Launch Plan Phase 1 (security), which protects live schools (`docs/LAUNCH_PLAN.md`).

---

## 1. Dynamic website builder (Webflow / Wix / HubSpot-style)

### Today
- The builder shows school data, but only through fixed "Data list" layouts (7 layouts, one fixed item shape). See `frontend/src/site/blocks/portal-data.tsx`.
- There is no visual item design, no profile pages for teachers, classes or events (only 3 hard-coded detail views), and no filters, search or pagination.
- There are no "show if" rules and no per-device styles.
- Bug: the Data list `columns` setting is ignored (`portal-data.tsx:195`).

### Decision: keep Puck and extend it
Moving to another editor means rewriting about 84 blocks and 25+ templates, and it wouldn't close the gaps faster. Puck 0.23 already has the hooks we need: slots, `resolveData`, `fieldTransforms`, permissions and inline editing.

### What we add (the Webflow pattern)
| # | Feature | Size | Tier |
|---|---|---|---|
| W1 | **Collection registry and one generic, tenant-safe query API** (`/public/sites/:siteId/collections/:key?filter&sort&q&page&include`). A whitelist of collections and fields, an explicit field list per adapter, page size ≤ 50, includes one level deep. Public slugs for teachers and classes. | 8–10 | MUST |
| W2 | **Bind any field to data.** A ⚡ button on every field; `{{item.name}}` tokens; an item context in the renderer. | 5–6 | MUST |
| W3 | **Collection List block.** Design one item with any blocks; filter, sort, limit, pagination; empty state; columns per breakpoint. | 6–8 | MUST |
| W4 | Designer blocks: Text, Image, Link/Button, Badge, Stack, Grid (all can be bound to data). | 4 | MUST |
| W5 | **Template (profile) pages per collection**: `/teachers/:slug`, `/classes/:slug`, events, notices, albums, admissions, courses. Designed visually, with SEO filled from the item, and good-looking defaults. | 7–9 | MUST |
| W6 | Visibility rules: "show if" empty / equals / greater than…, and hide on mobile, tablet or desktop. | 2 | MUST |
| W7 | Privacy guardrails: **no public student collection**, small-number suppression (< 5), guardian consent flag for toppers, and tests. | 3 | MUST |
| W8 | Style panel with phone/tablet/desktop settings, saved styles ("classes") and more theme tokens. | 8–10 | SHOULD |
| W9 | Relations and nested lists: a class page shows its teachers, subjects and routine; a teacher page shows their classes. | 4–5 | SHOULD |
| W10 | Filter bar, search box and pagination, synced to the URL. | 4 | SHOULD |
| W11 | Editor polish: inline text editing, copy/paste, locked template sections, layer names. | 3–4 | SHOULD |
| W12 | Pre-rendered meta tags for profile pages, so Facebook and WhatsApp link previews work. | 4 | SHOULD |
| — | Animations on scroll and hover; reusable sections; school-defined custom collections (like HubDB); AI-generated templates. | — | LATER |

**MUST ≈ 40–45 days · SHOULD ≈ 25–30 days.**

### Public vs private
- **Public:** staff and teachers **only after opt-in** (name, photo, role, subject, qualification). Committee, classes and subjects, routines (teacher names only if that teacher opted in), result **totals**, notices and events, albums, downloads, admissions, fees chart, holidays, library, transport routes, courses and products.
- **Never public:** any individual student record, guardians, form submissions, or notices addressed to one class.

---

### 1b. Custom modules with a template language (owner request, 2026-10-03)

Like HubSpot custom modules (HubL), Shopify sections (Liquid) or WordPress blocks: a school or developer builds their **own reusable block** with code. It appears in the editor palette like any built-in block, and non-technical staff fill in its fields.

**Template language: Liquid** (LiquidJS, MIT; runs in the browser and in Node). It's built for templates written by untrusted users: it cannot run arbitrary code or reach the network or files, and it has render limits. Shopify uses it for millions of stores. Handlebars is too weak, and Nunjucks/EJS can execute code, so neither is safe for tenant-written templates.

**A module contains:**
- **Fields schema (JSON):** text, rich text, number, boolean, select, colour, image (media library), link, date, **repeater** (a list of grouped fields), and **collection** (pick a collection from §8, plus filter/sort/limit). These generate the editor form automatically, with Bangla twins for text.
- **Template (Liquid HTML).** Example:
  ```liquid
  <section class="teacher-grid">
  {% for t in module.teachers %}
    <a class="card" href="{{ t.url }}"><img src="{{ t.photo | img: 400 }}" alt="{{ t.name }}">
    <h3>{{ t.name }}</h3><p>{{ t.designation }} · {{ t.subject }}</p></a>
  {% else %}<p>{{ module.empty_text }}</p>{% endfor %}
  </section>
  ```
  - Variables available:
    - `module.*`: field values; collection fields resolve to items through the §8 API.
    - `site.*`, `institution.*`, `page.*`, `lang`.
    - `item.*`: inside template pages and collection lists.
    - `url.query`.
  - Filters: `t`/translate, `bn_digits`, `date`, `money` (৳), `img` (Cloudinary resize), `escape` (on by default), `markdown`.
  - Tags: `{% collection "notices" limit:5 sort:"-date" as notices %}` queries data directly.
- **CSS:** automatically scoped to the module instance; theme variables available.
- **JS (optional):** if present, the module runs inside the existing sandboxed iframe (`SandboxFrame`, no same-origin), with `SITE.data()` for data. Without JS it renders inline in the page, which is fast and SEO-friendly.

**Safety:**
- Liquid output goes through the existing HTML sanitiser (DOMPurify on the client, the server allowlist sanitiser from LAUNCH_PLAN B7).
- Render timeout and output size cap.
- Data only through the whitelisted, tenant-safe collections API, so **no student data**, and the same privacy rules apply.
- Only ADMIN and a new "Website developer" permission can edit module code; editors can only fill in fields.

**Workflow:**
- A **Modules tab** in the Website Builder: list, create, and an editor with Fields / HTML / CSS / JS tabs, live preview with sample data, and validation errors with line numbers.
- Version history and **publish** (pages use the published version).
- **Import/export** a module as a JSON file, so a module can be shared between schools.
- A starter library: teacher grid, notice ticker, event calendar, result highlights, admission banner, FAQ, pricing.
- Later: AI writes a module from a prompt, and a marketplace of shared modules.

**Data and API:**
- `SiteModule` (siteId, institutionId, key, name, category, icon, fields Json, template, css, js, status, version) and `SiteModuleVersion`.
- Admin CRUD/publish/import/export under `/api/v1/sites/modules`.
- The public resolve includes the site's published modules.
- Page data references a module as a `CustomModule` block (`{ moduleKey, version?, values }`).

| # | Item | Size | Tier |
|---|---|---|---|
| W13 | Module model + admin API + versioning + import/export | 4 | MUST |
| W14 | Liquid renderer (custom filters/tags, collection resolution, sanitise, scoped CSS, sandbox when JS present) | 5–6 | MUST |
| W15 | Dynamic `CustomModule` block: auto-generated Puck fields from the schema, palette entries per module | 4 | MUST |
| W16 | Modules tab: code editor (CodeMirror, already installed), live preview with sample data, errors | 5 | MUST |
| W17 | Starter module library (7 modules) | 3 | SHOULD |
| W18 | AI "write a module", module marketplace | — | LATER |

**≈ 18–20 days (MUST),** built right after W1–W6, because it reuses the collections API and the binding renderer.

**Status (2026-10-04): W13–W17 built on `Habib` (Track MOD), not deployed.**
- **Schema:** `SiteModule` and `SiteModuleVersion` are in `schema.prisma` under the TRACK MOD marker. The lead still needs to generate the migration.
- **API:**
  - Admin: `/api/v1/sites/modules` (CRUD, publish, versions/restore, import/export, validate).
  - Public: `GET /public/sites/:siteId/modules` returns published snapshots only.
- **Renderer:** `frontend/src/site/modules/*`.
- **Admin:** the Modules tab, with the starter library of 7 modules.
- **Usage guide:** docs/website-builder/GUIDE.md §7.
- **Permission hook:** the "Website developer" permission is a hook only for now. Users listed in `site.settings.websiteDeveloperUserIds` can edit modules; there is no UI for it yet.

## 2. AI lesson builder for teachers (slides, worksheets, quizzes)

### Today
- Lecture materials are an external link only, so there is nowhere to store a generated deck.
- The AI client uses Claude with Gemini as fallback.
- The **per-school AI limit is defined but not enforced on any AI route.**
- There is no streaming and no structured (schema-validated) output.

### Design
- **Flow:** the teacher enters class, subject, chapter, language and period length. Optionally they upload the textbook chapter as a PDF.
  1. Claude writes an **outline**.
  2. The teacher edits it.
  3. Claude writes the full **slides, 4 at a time, using schema-validated output**. Progress streams live.
  4. The teacher can **regenerate any single slide or question**.
- **Decks:** about 8 layouts (title, bullets, two-column, image, quote, diagram, quiz, activity, summary). Elements can be text, bullets, image, maths (KaTeX), diagram (Mermaid), table, callout or MCQ, and each is revealed step by step with animation. Speaker notes are included.
- **Worksheets and quizzes:** MCQ, multi-completion and shared-passage MCQ, short answer, fill-in-the-blank, matching, true/false, and **সৃজনশীল** (উদ্দীপক + ক/খ/গ/ঘ with marks), with an answer key and rubric.
- **Presenting:** fullscreen, keyboard and click to step through, animations, a speaker-notes window and a timer. A phone remote comes later.
- **Sharing:** "Publish" creates a normal lecture material or assignment for the class. Students see it read-only, without notes or answer keys. Content stays a **draft until the teacher publishes** it, and admin review is optional.
- **Export:** PowerPoint (pptxgenjs, Bangla font Nirmala UI), plus PDF and print. PDF uses browser print first and server Chromium (decision D1) later.
- **Images:** icons, teacher uploads, and stock photo search via Pexels with credits. Claude can't create images.
- **Cost control:** monthly **AI credits per school**, counted from tokens, a feature flag on the plan, and checks before each generation. The default model is Claude Sonnet 5.5; Haiku 4.5 handles quick edits.
- **Estimated cost per use:** a 15-slide deck ≈ **$0.10–0.20**, a worksheet ≈ $0.05–0.10.

| # | Item | Size | Tier |
|---|---|---|---|
| A1 | AI client: streaming + schema-validated output, long timeout, length-limit and refusal checks; model update. | 4 | MUST |
| A2 | Database: `TeachingResource` + versions, links to lecture materials and assignments; lessons module with role permissions. | 4 | MUST |
| A3 | Deck and worksheet schemas; Bangla, English and NCTB prompts; outline → edit → chunked generation; regenerate one item. | 8–10 | MUST |
| A4 | **AI credits, enforced** (also fixes the unenforced AI limit for every AI feature). | 3 | MUST |
| A5 | Deck renderer with animations + presenter mode. | 7–8 | MUST |
| A6 | Slide and worksheet editor. | 7–8 | MUST |
| A7 | Publish to class; student viewer; print/PDF. | 4 | MUST |
| A8 | PowerPoint export; stock images; KaTeX/Mermaid; textbook PDF grounding; Bangla quality test set. | 10–12 | SHOULD |
| — | Phone remote, overnight bulk generation, auto-graded online quiz, shared lesson library. | — | LATER |

**MUST ≈ 37–41 days.** Needs a **real Anthropic API key** (`sk-ant-api…`) in the server's `ANTHROPIC_API_KEY`.

---

## 3. Cameras: 30-day recording + automatic attendance

### Key facts
- One 1080p camera recording 24/7 uses about **0.65 TB per 30 days** (H.265), or 1.3 TB (H.264).
- 16 cameras uploading continuously need about **32 Mbps of upload, all day**. That's not realistic for most Bangladeshi schools, and power cuts break it.
- **Never run video on the app server.** It would starve the school app.
- Children's biometric data is **sensitive** under Bangladesh's data-protection law:
  - It needs **guardian consent** and an opt-out.
  - It should **not leave Bangladesh**, and our servers are in Singapore.
  - Passive face-tracking of students from CCTV is the highest-risk design.

### Recommended approach
**Recording**
- **30 days are stored at the school,** on its NVR (network video recorder), as commercial cloud camera products (Verkada, Eagle Eye) do.
- Our cloud keeps only an **index**: a thumbnail per camera every ~20 s, event clips, and access logs.
- **Live view and playback are on demand** through a small box at the school that connects out to us. No port forwarding is needed.

**Attendance**
- **Face-recognition terminals at the gate.** ZKTeco SpeedFace-V5L (≈৳27,000) or Hikvision DS-K1T343 (≈৳14,000). They support face, fingerprint and card, and have anti-spoofing.
- The device **pushes each check-in to our server.** ZKTeco's ADMS push works through NAT; Hikvision's ISAPI also pushes events.
- **Face data stays on the device, not in our cloud.**
- These events feed the existing attendance code (the QR check-in path), including the **guardian SMS**.

**Alternatives are mandatory**
- Card, fingerprint or QR for anyone who opts out, or who covers their face (hijab or niqab).
- Students are re-enrolled every year, because children's faces change.

### Phases
| Phase | Scope | Size |
|---|---|---|
| C0 | Consent records (face, fingerprint, CCTV notice; withdrawal), a legal opinion, and one attendance-event pipeline for every method. | ~2 weeks |
| C1 (MVP) | Terminal integration:<br>• ZKTeco ADMS endpoints and the Hikvision event receiver<br>• device registry, and mapping device users to students or staff<br>• rules: on time / late / absent at cutoff + SMS; staff check-in and check-out<br>• review queue for unknown or duplicate events, device-offline alerts<br>• duplicate-safe ids | 4–6 weeks |
| C2 | Camera index add-on:<br>• edge gateway (Docker on an N100 mini PC: MediaMTX/go2rtc, ONVIF, motion and person events)<br>• thumbnails timeline and event clips (Cloudflare R2 / Backblaze B2)<br>• live view and playback via an outbound tunnel + TURN relay on a **separate** VPS<br>• access logs, 30-day automatic deletion | 6–8 weeks |
| C3 | Optional cloud recording for 2–4 key cameras; a staff-only CCTV face attendance pilot with adult consent; headcount analytics without identifying anyone. | later |

### Costs
- **Hardware, one-off per school:**
  - Small (≤500 students, 4–8 cameras): **৳60–90k**.
  - Medium (500–1,500 students): **৳1.6–2.2 lakh**.
  - Large: **৳3–4 lakh**.
  - Each includes terminals, NVR, disks, UPS and PoE switch.
- **Our running cost:**
  - Terminal attendance: ~৳0 (SMS is already billed).
  - Camera index: under **$1 per school per month** for 16 cameras, plus a shared relay VPS (€5–15/month).
- **Pricing ideas:**
  - Attendance devices: ৳3–5k setup and ৳500–1,000 per terminal per month.
  - Camera index: ৳150–300 per camera per month.
  - Cloud recording for key cameras: ৳800–1,500 per camera per month.

---

## 4. Suggested order

| Step | Work | Why |
|---|---|---|
| 1 | Launch Plan **Phase 1 security** (~2 weeks) | Live schools are exposed today |
| 2 | **AI lesson builder MVP** and **website builder MUST** in parallel (separate code areas, ~8–10 weeks) | Highest teacher and sales value |
| 3 | **Face attendance C0 + C1**: start the legal review and buy one test terminal now | Hardware lead time and legal review run in parallel with step 2 |
| 4 | Camera index add-on (C2), then the SHOULD items | Bigger infrastructure; build after attendance proves demand |

## 5. Decisions needed from the owner
1. **Anthropic API key:** create a real key at console.anthropic.com. It starts `sk-ant-api…`; the `sk-ant-usr…` token pasted earlier is not one. **Revoke that token.**
2. **Approve the order** in §4, including the MUST scope for the website builder and the AI lesson builder.
3. **Which face-terminal brand to support first:** ZKTeco (easiest two-way integration; recommended) or Hikvision (cheaper). Then buy **one test unit**.
4. **Camera approach:** record at the school with a cloud index, rather than full cloud recording.
5. **Legal review:** have a Bangladeshi lawyer confirm consent and data-transfer requirements for student biometrics before go-live of C1.
6. **Monthly AI credits per plan:** for example Basic 100 decks, Pro 500.


---

## 8. Collections API contract (W1, W5, W7, W9 backend) — STABLE

Status: built by the Website Collections backend track. The frontend builds against this section; if it must change, this section is updated first. Base URL for all public endpoints: `/api/v1/public/sites/:siteId`. No auth. Rate limit: the existing public read limiter. Preview: pass `?preview=<token>` or the `X-Site-Preview` header exactly as for `data/*`; a valid token also shows DRAFT site-owned content (albums, downloads, admissions, courses, products). Cache headers: published responses `public, max-age=120, stale-while-revalidate=600`; previews `private, no-store`. Every response uses the normal envelope (`{ success, message, data, ... }`).

### 8.1 Endpoints

| Method and path | Purpose |
|---|---|
| `GET /collections` | Registry for the editor: every collection with fields, filter ops, relations, route base, and whether the school has it switched on. |
| `GET /collections/:key` | Query a collection (filter, sort, search, paginate, include). |
| `GET /collections/:key/items/:slug` | One item (full detail fields, optional relations, derived SEO). |

Existing `data/*` endpoints keep working unchanged in shape.

Errors: `404` unknown site, unknown collection (including `students`, which does not exist and never will), or unknown item; `403` the collection is switched off in the school's settings (`available: false` in the registry); `400` any malformed query (unknown field, unknown op, op not allowed for that field, bad value, pageSize > 50, unknown include, more than 10 filters, ...). The `message` of a 400 names the problem (for example `Unknown field "salary" for collection "teachers"`).

### 8.2 `GET /collections` response

`data` is:

```json
{
  "collections": [
    {
      "key": "teachers",
      "label": "Teacher",
      "labelPlural": "Teachers",
      "available": true,
      "unavailableReason": null,
      "slugSource": "publicSlug",
      "titleField": "name",
      "routeBase": "/teachers",
      "defaultSort": "name",
      "maxPageSize": 50,
      "fields": [
        { "key": "name", "label": "Name", "type": "text", "filter": ["contains"], "sortable": true, "searchable": true, "detailOnly": false, "options": null },
        { "key": "photoUrl", "label": "Photo", "type": "image", "filter": [], "sortable": false, "searchable": false, "detailOnly": false, "options": null }
      ],
      "relations": [
        { "key": "classes", "label": "Classes", "collection": "classes", "many": true }
      ]
    }
  ]
}
```

- `type` is one of `text | rich | image | date | number | bool | url | list`. `rich` is sanitised HTML; `image` and `url` are URL strings; `date` is an ISO 8601 string; `list` is an array of strings.
- `filter` lists the allowed filter ops for the field (empty = not filterable). Ops: `eq`, `ne`, `in` (comma separated, max 20 values), `contains` (case-insensitive substring, text only), `gt`, `gte`, `lt`, `lte` (number and date), `has` (list contains one value).
- `sortable` / `searchable`: whether the field may be used in `sort` / is covered by `q`.
- `detailOnly`: the field is only present on the single-item endpoint, not in lists (long bodies).
- `options`: for enum-like text fields, the allowed values (filters with other values are a 400); otherwise `null`.
- `routeBase`: the public URL prefix for profile pages, or `null` when the collection has no profile pages. Item URL = `routeBase + "/" + item.slug`. Only collections with a `routeBase` may have a TEMPLATE page.
- `slugSource`: informational (`publicSlug`, `slug` or `id`). Always use `item.slug`.
- `relations[].collection`: the collection a relation points at (you can link its cards to that collection's profile page via `slug`), or `null` for plain nested data.
- `defaultSort` is a sort expression (`name`, `-publishedAt`) or `"manual"` (the order the admin arranged in the dashboard).
- Unavailable collections (`available: false`) are still listed so the editor can explain; `unavailableReason` is a short human message.

### 8.3 `GET /collections/:key` — query syntax

```
?filter[field][op]=value      repeat for several filters (all must match); max 10
&sort=-field                  "-" = descending; comma list allowed, max 2
&q=text                       search the searchable fields, max 100 chars
&page=1                       default 1, max 1000
&pageSize=20                  default 20, max 50
&include=rel1,rel2            relations to expand (one level), see 8.5
&preview=<token>
```

Examples: `?filter[department][eq]=Science&sort=name&pageSize=12`, `?filter[startDate][gte]=2026-10-01&sort=startDate`, `?filter[level][in]=6,7,8&include=classTeacher`, `?q=physics`.

Values: numbers and booleans (`true`/`false`) are parsed by field type, dates accept `YYYY-MM-DD` or a full ISO timestamp. Repeating the same `filter[f][op]` twice is a 400.

Response (`paginatedResponse`):

```json
{
  "success": true, "message": "Success",
  "data": [ { "slug": "rahim-uddin-k3f9a2", "name": "Rahim Uddin", "photoUrl": "https://...", "designation": "Senior Teacher", "department": "Science", "subject": "Physics", "qualification": "MSc", "classNames": ["Class 8 A"], "classes": [ { "slug": "class-8-x7q2m1", "name": "Class 8", "level": 8 } ] } ],
  "meta": { "total": 14, "page": 1, "pageSize": 20, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "collection": "teachers",
  "preview": false
}
```

(`classes` is only present because the request had `include=classes`.)

### 8.4 `GET /collections/:key/items/:slug` — query `?include=...&preview=`

`data`:

```json
{
  "item": { "slug": "...", "...fields incl. detailOnly...": "...", "...included relations...": "..." },
  "seo": { "title": "Rahim Uddin", "description": "first 160 chars of plain text or null", "image": "https://... or null" },
  "preview": false
}
```

### 8.5 Item shape

A flat object: `slug` (always present, string) plus one key per field (list and detail rules above), plus one key per requested relation. Nothing else — no internal ids for people, no phone/email/DOB/address. Missing values are `null` (never omitted), except relation keys which are only present when requested through `include`. Relation values: many-relations are arrays, to-one relations are an object or `null`. Relation values are small "cards" (they cannot be included further, "one level deep"). Card shapes:

- teacher card (relations pointing at `teachers`): `{ slug, name, photoUrl, designation, subject }`
- class card: `{ slug, name, level }`
- subject card: `{ slug, name }` (from `classes.subjects` also `group`, `paper`)
- plain nested data (`collection: null`) is described in 8.6.

### 8.6 Collections

Common: `slug` is the profile-page key. Fields marked (D) are detailOnly. S = sortable, Q = searchable; filter ops in brackets.

| key | gate (settings) | routeBase | slug is | fields | relations |
|---|---|---|---|---|---|
| `teachers` | none; only users with `showOnWebsite` | `/teachers` | `User.publicSlug` | name (S, Q, [contains]), photoUrl, designation (S, Q, [eq,in,contains]), department (S, [eq,in,contains]), subject (S, Q, [eq,contains]), qualification (S, [contains]), classNames (list, classes the teacher is class teacher of) | `classes` (to `classes`, many), `subjects` (to `subjects`, many) |
| `staff` | none; non-teaching staff with `showOnWebsite` | `/staff` | `User.publicSlug` | same fields as teachers | none (filter by `department` instead) |
| `committee` | none | none | record id | name (S, Q), nameBn, role (S, Q, [eq,contains]), roleBn, photoUrl, phone (null unless the admin ticked "show phone") | none |
| `classes` | none | `/classes` | `Class.publicSlug` | name (S, Q, [eq,in,contains]), level (S, [eq,in,gt,gte,lt,lte]), medium (text), shift (text), sectionNames (list), studentCount, maleCount, femaleCount, otherCount (numbers, see 8.7, may be `null`) | `sections` (nested: `[{ name, classTeacher: teacherCard or null }]`), `subjects` (to `subjects`; cards add `group`, `paper`), `routine` (nested: `[{ dayOfWeek, startTime, endTime, sectionName, subject, roomNumber, teacherName }]`, `teacherName` null unless that teacher opted in), `classTeacher` (to `teachers`, many: distinct opted-in class teachers), `teachers` (to `teachers`, many: opted-in teachers on the class routine) |
| `subjects` | none | `/subjects` | subject id | name (S, Q, [eq,contains]), classNames (list, [has]) | `classes` (to `classes`, many), `teachers` (to `teachers`, many, opted-in teachers on routines) |
| `notices` | none; public notices only (audience ALL/PUBLIC, not addressed to a class or section, already published) | `/notices` | notice id | title (S, Q, [contains]), excerpt (text, first 160 chars), content (D, rich), publishedAt (date, S, [gt,gte,lt,lte]) | none |
| `events` | none; community events only | `/events` | event id | title (S, Q), description (text), category ([eq,in], options), type ([eq], options), startDate (date, S, [eq,gt,gte,lt,lte]), endDate (date, S, same ops), startTime, endTime, venue ([contains]), imageUrl | none |
| `albums` | none | `/gallery` | album id | title (S, Q), titleBn, coverUrl, description, eventDate (date, S, [gt,gte,lt,lte]), photoCount (number) | `photos` (nested: `[{ url, caption }]`) |
| `admissions` | none | `/admissions` | circular id | session (S, [eq,in]), classNames (list, [has]), title (S, Q), titleBn, startDate, endDate (dates, S, filters), fee (number, S, [gt,gte,lt,lte]), pdfUrl, applyUrl, formId, closed (bool, computed), body (D, rich) | none |
| `downloads` | none | none | download id | title (S, Q), titleBn, category (S, [eq,in]), fileUrl, publishedAt (date, S) | none |
| `courses` | `settings.courses.enabled` | `/courses` | `SiteCourse.slug` | title (S, Q), titleBn, summary, coverUrl, price (number, S, filters), level ([eq]), category ([eq,in]), instructorName, durationText, lessonCount, totalMinutes, description (D, rich) | `lessons` (nested: `[{ title, module, kind, durationMin, isFreePreview }]` — no video/file URLs ever) |
| `products` | `settings.shop.enabled` | none | `SiteProduct.slug` | name (S, Q), nameBn, images (list), price (number, S, filters), compareAtPrice, category ([eq,in]), kind ([eq], options), inStock (bool), description (D, rich) | none |
| `holidays` | none | none | holiday id | title (S, Q), date (date, S, filters), type ([eq,in], options), isTentative (bool, [eq]) | none (weekly offs are excluded) |
| `branches` | none | none | branch id | name (S, Q), address, phone, email | none |
| `exams` | `settings.publicResults` or `settings.publicResultSummary`; only finished, active, results-published exams | none | exam id | name (S, Q), startDate (date, S), endDate (date, S) | `classSummaries` (nested aggregate: `[{ className, appeared, passed, passRate, gpa5Count, suppressed }]`, see 8.7) |

Slug generation: `publicSlug` is `kebab-name-` + 6 random lowercase alphanumerics (for example `rahim-uddin-k3f9a2`), generated when a staff member's `showOnWebsite` turns on and lazily for classes and for staff that were visible before this feature. Slugs are stable after generation.

### 8.7 Privacy rules the API enforces (W7)

- There is no collection for students, guardians, form submissions or class-addressed notices. `GET /collections/students` is a 404.
- `teachers` / `staff`: only active users with `showOnWebsite = true`; only the public-safe fields above. Never phone, email, DOB, address, salary.
- Routine teacher names (in `classes.routine`, `classes.teachers`, `classes.classTeacher`, `classes.sections[].classTeacher`, and the existing `data/routine`) appear only for teachers who opted in; otherwise `teacherName` is `null` / the teacher is omitted.
- Small-number suppression: any count between 1 and 4 is replaced by `null` (0 stays 0). For `classes`: if any of male/female/other is suppressed, `studentCount` is `null` too (so it cannot be subtracted back). For `exams.classSummaries`: a class with fewer than 5 students appeared has `suppressed: true` and `appeared`, `passed`, `passRate`, `gpa5Count` all `null`; otherwise `passed` and `passRate` are `null` when passed or failed is 1-4, and `gpa5Count` is `null` when 1-4. `suppressed` is `false` for rows with real numbers.
- Toppers (existing `data/toppers`) now also require the student's `publicConsent` flag in addition to `settings.showToppers`.
- Committee phone is `null` unless the admin ticked "show phone".

### 8.8 Template pages (W5) and resolve

Page admin API (`/api/v1/sites/pages`): pages now carry two extra fields, returned by list/get/create/update and by the public `GET /pages/:slug`:

- `kind`: `"PAGE"` (default) or `"TEMPLATE"`.
- `collectionKey`: `null` for PAGE; for TEMPLATE the collection key (only collections that have a `routeBase`). Unique per site: a second template for the same collection is a 409.

`POST /pages` accepts `kind` and `collectionKey`. For `kind: "TEMPLATE"`, `collectionKey` is required and `slug` is optional (default `template-<collectionKey>`; this is the page you fetch with `GET /pages/:slug` and edit like any page). For `kind: "PAGE"` (or omitted), `collectionKey` must be absent and `slug` is required as before. `PUT /pages/:id` accepts `collectionKey` for TEMPLATE pages only; `kind` cannot be changed after creation. Template pages are not listed in `resolve.pages` and not in the sitemap as pages.

`GET /api/v1/public/sites/resolve` gains `templateRoutes`:

```json
"templateRoutes": [ { "collection": "teachers", "base": "/teachers", "pageSlug": "template-teachers" } ]
```

One entry per TEMPLATE page that is published (any TEMPLATE page when previewing). The renderer matches a path `base/:slug`, loads the page with `GET /pages/<pageSlug>`, and loads the item with `GET /collections/<collection>/items/:slug`. If a site has no template for a collection, the renderer keeps its built-in detail view (`/gallery/:id`, `/admissions/:id`, `/notices/:id`, `/courses/:slug`).

Sitemap (`GET /sitemap.xml`): for every published TEMPLATE page whose collection is available, every item is listed at `base/<slug>` (cap 500 per collection, de-duplicated against the existing `/gallery`, `/admissions`, `/notices` entries).

### 8.9 Schema (for reference)

`User.publicSlug`, `Class.publicSlug` (unique, nullable), `SitePage.kind` (enum `SitePageKind` PAGE|TEMPLATE, default PAGE), `SitePage.collectionKey` (unique with `siteId`), `Student.publicConsent` (default false). No new tables. Migration is generated by the lead.
