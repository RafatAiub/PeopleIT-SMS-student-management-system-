# Website Builder Guide

How PeopleNIT's school website builder works, and how to make your own blocks ("custom modules") and use them with drag and drop.

| You are… | Read |
|---|---|
| A school admin or tester building a site | §1–§4 |
| A web designer who knows HTML/CSS/JS | §5 (Custom Code blocks and code pages, **available now**) |
| A developer on this codebase | §6 (add a new block to the palette, **available now**) |
| Anyone building reusable coded modules | §7 (Liquid custom modules, **available** 🧪) |

Status markers used below:
- **✅ Live:** in `main`.
- **🧪 Local:** built and working on the `Habib` branch, not yet deployed.
- **🗓 Planned:** designed, not built.

---

## 1. How the builder works

```
Website Builder (dashboard: /website-builder)
 ├─ Pages ──► Page editor (drag & drop, Puck) ──► page data saved as JSON (draft → publish)
 ├─ Design (templates, header/footer style, colours, fonts)
 ├─ Profile, Content (committee, albums, downloads, admissions), Navigation, Media, Blog, Forms, Shop, Courses, Code, Domains, Settings
 └─ Public site: /s/<subdomain>  or the school's own domain
        renders the same blocks from the published JSON + live school data from the API
```

- **Two pieces share one block list.** The **editor** (Puck, `@puckeditor/core`) and the **public site** (`frontend/src/site/render.tsx`) both use `frontend/src/site/config.tsx`. A block looks the same in both, and the public site never loads the editor code.
- **A page is JSON:** `{ root: { props }, content: [ { type: "Hero", props: {...} }, … ] }`. Saving stores a **draft**. **Publish** copies it to the live version and keeps a snapshot in **version history**, up to the last 30 versions.
- **Live data:** blocks such as Notices, Teachers, Results and Collection List fetch from the public API (`/api/v1/public/sites/:siteId/...`). That API only returns public-safe fields, so **no student personal data** ever reaches the site. Teachers and staff appear only after **"Show on website"** is switched on for them.
- **Bangla:** most text fields have a Bangla twin, shown when the visitor picks বাংলা.

## 2. Build a site in 10 steps (school admin)

1. **Website Builder → Design → Templates:** pick a template (e.g. **Bangla School Portal**) and click **Apply**.
   - *Replace* swaps out all pages.
   - *Merge* adds the template's pages and keeps yours.
2. **Profile:** fill in the Bangla name, EIIN, established year, MPO/recognition, head of institution, and the information and complaints officers.
3. **Profile → Staff:** switch on **Show on website** for each teacher or staff member who should appear.
4. **Content:** add the managing committee, photo albums, downloads and admission circulars. Publish each one.
5. **Pages:** open a page.
   - Drag blocks in from the left palette.
   - Click a block to edit its fields on the right.
   - Use the desktop/tablet/phone buttons to preview each screen size.
6. **Navigation:** build the header and footer menus. Drag to reorder; drag one item onto another to nest it.
7. **Design:** set colours, fonts, header/footer style, boxed or full-width layout, and page background.
8. **Settings:** set the top bar, hotlines, important links, e-services, logo and favicon, and which public data to show (result summary, fee chart, library, transport).
9. **Overview:** check the **DSHE compliance checklist** (11 items) and fix anything marked missing.
10. **Publish** the site. The public address appears on Overview. **Domains** connects the school's own domain.

## 3. The block palette

| Category | Blocks |
|---|---|
| Layout | Section, Columns (2/3/4), Spacer, Divider |
| Data & free-form design 🧪 | **Collection List**, Stack, Grid, Text, Picture, Link/Button, Badge |
| Content | Hero, Heading, Rich text, Buttons, Cards, Stats, Testimonials, FAQ, Call to action, Contact info, Timeline, Principal's message |
| Media | Image, Gallery, Video, Logo strip, Map, Embed |
| Live school data | Notices, Events, Teachers, Toppers, Results lookup, Class routine, Live stats, Enquiry form, Fee payment, Latest news, Courses, AI assistant |
| Design (landing pages) | Feature grid, Pricing, Steps, Team, Bento grid, Countdown, Newsletter, Tabs, Marquee, Comparison table, Split hero, Gradient banner, Testimonial wall, Announcement bar |
| Shop & courses | Product grid, Featured product, Cart button, Course grid, Featured course, Account button |
| Portal & DSHE data | Data list, Notice board, News ticker, Staff directory, Committee, Downloads, Albums, Admission circulars, Result summary, Exam routine, Class stats, Fee chart, Holidays, Library, Transport, Branches, Profile facts, Info box grid, Sidebar layout, Sidebar card, Head's message, Hotlines, Facebook page, Video gallery, Audio player, Image slider, Important links, E-services, Data table |
| Custom code | **Custom Code (HTML/CSS/JS)** |
| My modules 🧪 | **Custom module** (pick any module), plus one entry per published module of your school (§7) |

## 4. Dynamic pages: bind blocks to school data 🧪

These work like Webflow's CMS, but with school data.

### 4.1 Collection List: design one card, repeat it for every record
1. Drag a **Collection List** onto the page.
2. Pick a **source**: teachers, staff, committee, classes, subjects, notices, events, albums, admissions, downloads, courses, products, holidays, branches or exams.
3. Set **filters, sort, limit and pagination**.
   - A filter value can be typed in, or taken from the URL, e.g. `?dept=Science`.
   - Choose a layout: grid, list, slider or table, with the number of columns per screen size.
4. Inside the list's **item** area, drag any blocks, e.g. Picture, Text, Badge and Link/Button. **Item 1 is the editable design**; the other items are live copies.
5. On each field, click **⚡ Bind to data** and choose the field, e.g. Text → `name`, Picture → `photo`, Link → `url`.
   - Optional formats: long date, UPPERCASE, Bangla digits (`bn-digits`) or money (৳).
6. Optionally fill the **empty** area, shown when nothing matches.

You can also type tokens into any text: `{{item.name}}`, `{{item.designation}}`, `{{parent.title}}`, `{{url.q}}`.

### 4.2 Profile (template) pages
**Pages → New template page → pick a collection** (teachers, classes, events, notices, albums, admissions…).
- You design it **once**, and it serves every record at `/teachers/<name>`, `/classes/<name>`, and so on.
- Use **Preview with item** to design against a real record.
- SEO title and description can use `{{item.name}}`.
- Default designs are provided, so you can start from one.

### 4.3 Show-if rules
Every block has a **Visibility** setting:
- Show only if a field is empty, not empty, equals, is greater or less than, or contains a value. Rules can combine with all/any.
- Hide on phone, tablet or desktop.

Example: a "Head of institution" badge that only appears on the head's card.

## 5. Custom code you can use today (no developer needed) ✅

### 5.1 Custom Code block (one block on a normal page)
Palette → **Custom code → Custom Code (HTML/CSS/JS)**. It has **HTML**, **CSS** and **JavaScript** tabs (code editor), plus height (fit content / fixed) and full width.

```html
<!-- HTML -->
<div class="notice-strip"><strong>Notice:</strong> <span id="latest">Loading…</span></div>
```
```css
/* CSS — theme colours are available as CSS variables */
.notice-strip { padding: 12px 16px; border-radius: var(--site-radius); background: var(--site-primary); color: var(--site-on-primary); }
```
```js
// JavaScript — read live school data through the safe SITE bridge
SITE.data('notices', { limit: 1 }).then((list) => {
  document.getElementById('latest').textContent = list[0]?.title || 'No notices';
});
```

**The SITE bridge:** custom code runs in a **sandboxed frame**, so it can never touch the dashboard or log-ins. These are available inside it:

| API | Purpose |
|---|---|
| `SITE.data(source, params)` → Promise | Live public data. Sources: `notices, events, teachers, staff, posts, courses, products, profile, stats, toppers, routine, fees-link, class-stats, subjects, exam-routine, result-summary, results-archive, fee-chart, holidays, library, transport, branches, committee, albums, downloads, admissions` |
| `SITE.navigate('/about')` | Open another page of the site |
| `SITE.addToCart(productSlug, qty)` / `SITE.openCart()` | Shop actions |
| `SITE.siteId`, `SITE.lang`, `SITE.basePath`, `SITE.institution.name` | Context |

Links like `<a href="about.html">` inside custom code are mapped to site pages automatically.

### 5.2 Code pages (a whole page in HTML/CSS/JS)
**Pages → Add page → Code**. You get full-page HTML/CSS/JS with live preview, a desktop/tablet/phone preview, and a choice to show or hide the site's header and footer. The same SITE bridge is available.

### 5.3 Import a site (ZIP or HTML)
**Pages → Import website**. This takes a single HTML file (e.g. from Claude) or a ZIP of a **built** site (a `dist/` folder).
- Images are uploaded to the media library.
- Each HTML file becomes a draft code page, and links between pages keep working.
- Source projects (React/Vite/Next not yet built) are rejected with "run `npm run build` and upload `dist/`".

### 5.4 Site-wide code
**Code tab:** custom CSS for the whole site, and head/body HTML (e.g. analytics or chat widgets). Head/body scripts only run on the live domain or subdomain, never in the dashboard.

**Limits of today's custom code:** a Custom Code block is configured by editing its code. Non-technical staff can't fill in a simple form for it. Reusable, form-driven coded blocks are what §7 adds.

## 6. Developers: add a new block to the drag-and-drop palette ✅

A block is a Puck component definition. Add it once and it appears in the palette for every school.

**Step 1: create the block** in `frontend/src/site/blocks/` (new file or an existing one):

```tsx
// frontend/src/site/blocks/my-blocks.tsx
import { BlockSection, i18nFields, numberField, sectionDefaults, sectionFields, selectField, type SectionProps, type SiteBlock } from './shared';
import { useSiteText } from '../runtime';

export const AchievementBanner: SiteBlock = {
  label: 'Achievement banner',
  fields: {
    ...i18nFields(['title', 'Title'], ['text', 'Text', 'textarea']), // adds title + titleBn, text + textBn
    year: numberField('Year', 1900, 2100),
    tone: selectField('Style', [['soft', 'Soft'], ['primary', 'Brand colour']]),
    ...sectionFields, // background tone, spacing, width, anchor
  },
  defaultProps: { title: 'Best school award', titleBn: 'সেরা বিদ্যালয় পুরস্কার', text: '', textBn: '', year: 2026, ...sectionDefaults, tone: 'soft' },
  render: (p) => <AchievementBannerView {...p} />,
};

function AchievementBannerView(p: Record<string, any>) {
  const { tx } = useSiteText(); // picks English or Bangla, fills {{tokens}}
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className="site-card p-6 text-center">
        <p className="site-eyebrow">{p.year}</p>
        <h2 className="site-h2">{tx(p.title, p.titleBn)}</h2>
        <p>{tx(p.text, p.textBn)}</p>
      </div>
    </BlockSection>
  );
}
```

**Step 2: register it** in `frontend/src/site/config.tsx`:
- Import it, then add `AchievementBanner` to `RAW_COMPONENTS`.
- Add `'AchievementBanner'` to one category's `components` list in `BLOCK_CATEGORIES`, or create a new category. That decides where it appears in the palette.

**Step 3: done.** Every block is automatically wrapped by `makeBindable()` (`frontend/src/site/bindable.tsx`), so yours gets **⚡ Bind to data** and **Visibility** for free, and renders the same in the editor and on the public site.

**Building blocks to reuse** (`blocks/shared.tsx`):
- Field helpers: `i18nField(s)`, `textField`, `urlField`, `numberField`, `selectField`, `radioField`, `yesNo` (plus `codeField` from `fields/CodeField.tsx` for a code editor field).
- Theme CSS variables for styling: `--site-primary`, `--site-on-primary`, `--site-accent`, `--site-surface`, `--site-text`, `--site-muted`, `--site-border`, `--site-radius`, `--site-font`, `--site-heading-font`.
- Layout and content: `sectionFields`/`BlockSection`, `introFields`/`SectionIntro`, `SiteLink`, `SiteImage`/`optimiseImage`, `RichHtml`.
- States: `EmptyBlock`, `EditorHint`, `SkeletonRows`, `ErrorBlock`.

**Live data:** call the typed API in `frontend/src/site/api.ts` with React Query (see `blocks/live-feeds.tsx`). For list-style data, prefer the Collection List.

**Rules:**
- Never rename a block's key or a prop once pages use it, because saved pages reference them. Add a new prop and keep reading the old one.
- Keep public data public-safe: anything new must come through the public sites API (backend `modules/sites`) with an explicit field list.
- Respect lite mode and `prefers-reduced-motion` for animation; check the block works at 360 px wide; give images alt text.
- Add a test to `frontend/src/site/__tests__/site-logic.test.ts` for any pure logic.

## 7. Custom modules with a template language 🧪 Available (FEATURES_V4_PLAN §1b, W13–W17)

A school or a developer writes a **reusable module** in the browser. It then appears in the palette, and **non-technical staff just fill in a form and drag it onto pages**, like HubSpot modules or Shopify sections.

### 7.1 How it works
1. **Website Builder → Modules → New module** (or **Import** a `.json` file, or **Install** a starter from the library on the same tab).
2. **Fields tab:** define the form, visually or with **Edit as JSON**. Types: text, long text (`textarea`), rich text (`richtext`), number, yes/no (`boolean`), select, colour (`color`), image, link, date, **repeater** (a list of grouped fields) and **collection** (pick teachers, notices… with filter, sort and limit). Up to 50 fields.
3. **HTML (Liquid) tab:** write the template in **Liquid**. Shopify uses it, and it cannot run arbitrary code, so it is safe for school-written templates. Problems are listed under the editor with their **line numbers** as you type.
4. **CSS tab:** styles are automatically scoped to each copy of the module. **JS tab** is optional; a module with JS runs in the sandbox (§5.1) with the `SITE` bridge.
5. **Live preview** (right side) uses sample values and your site's **real data**, in English or Bangla. Then **Save draft** and **Publish**. Each publish is a numbered version; **Versions** restores an old one into the draft.
6. In the page editor the module appears under **My modules**. Editors **drag it onto any page** (also inside a **Collection List** item or on a **profile page**) and fill in the auto-generated form. Changing and re-publishing the module updates every page that uses it. (Optional: *Pin to version* in the block settings keeps one copy on a fixed version.)
7. **Export** downloads the module as JSON, to share it with another school (**Import** gives it a new key if that key is taken). **Delete** warns you when pages still use the module.

Each module has at most 100 KB each of HTML, CSS and JS. Only **admins** (and users listed as website developers, see §7.5) can edit module code; editors only fill in fields.

### 7.2 Example module: "Teacher spotlight"
This is also the first module in the **starter library**.

Fields (JSON):
```json
[
  { "key": "heading", "type": "text", "label": "Heading", "bn": true, "default": "Our teachers" },
  { "key": "teachers", "type": "collection", "collection": "teachers", "limit": 6, "sort": "name" },
  { "key": "show_subject", "type": "boolean", "label": "Show subject", "default": true }
]
```
Template (Liquid):
```liquid
<section class="spotlight">
  <h2>{{ module.heading | t }}</h2>
  <div class="grid">
  {% for t in module.teachers %}
    <a class="card" href="{{ t.url }}">
      <img src="{{ t.photo | img: 400 }}" alt="{{ t.name }}">
      <h3>{{ t.name }}</h3>
      {% if module.show_subject and t.subject %}<p>{{ t.subject }}</p>{% endif %}
    </a>
  {% else %}
    <p>{{ 'No teachers yet' | t }}</p>
  {% endfor %}
  </div>
</section>
```
CSS:
```css
.spotlight .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.spotlight .card { border-radius: var(--site-radius); padding: 12px; background: var(--site-surface); text-decoration: none; }
```
The editor form gets *Heading*, *Heading (বাংলা)*, a *Teachers* picker (collection, sort, how many, filters) and *Show subject* (Yes/No).

### 7.3 Template reference
- **Variables:**
  - `module.*`: field values.
    - A text field with `"bn": true` holds the **visitor's language** (the Bangla twin when it is filled, otherwise the English text). Both are also available as `module.<key>_en` and `module.<key>_bn`.
    - Collection fields arrive as **lists of items**, fetched with their configured collection, filters, sort and limit.
    - A repeater is a list of items with the repeater's own fields.
    - Empty text is `nil`, so `{% if module.x %}` works as expected.
  - `site.name`, `site.tagline`, `site.id`; `institution.name`, `.phone`, `.email`, `.address`, `.eiin`, `.logo`…; `head.name`, `head.designation`; `year`.
  - `item.*` inside profile (template) pages and Collection List items; `parent.*` is the enclosing list's item; `page.*` is the profile page's record.
  - `lang` (`"en"` or `"bn"`), `url.query.<param>` (e.g. `url.query.q`) and `url.path`.
  - Every item (collection fields, `{% collection %}`, `item`) also gets two shortcuts: `url`, the link to its profile page, and `photo`, its first image (`photoUrl`, `imageUrl`, `coverUrl` or `images[0]`).
- **Filters** (plus every standard Liquid filter, such as `default`, `upcase`, `split`, `size`, `round`):
  - `t`: picks Bangla or English. `{{ module.heading | t }}`. A plain string is translated from the built-in phrase book (`{{ 'No teachers yet' | t }}`), or you give the Bangla yourself: `{{ 'Apply now' | t: 'আবেদন করুন' }}`. An `{ "en": …, "bn": … }` value picks by language.
  - `date`: `{{ d | date }}` (long, e.g. *12 March 2026* or *১২ মার্চ ২০২৬*). Presets: `'short'`, `'day'`, `'month'`, `'weekday'`, `'time'`, `'datetime'`. A `%` format such as `'%d %b %Y'` uses standard Liquid strftime.
  - `money`: `{{ 1500 | money }}` gives ৳1,500 (Bangladeshi grouping, e.g. ৳12,34,567; Bangla digits on the Bangla site).
  - `num`: `{{ 1234567 | num }}` gives 12,34,567; `{{ 98.456 | num: 1 }}` gives 98.5 (at most 1 decimal).
  - `bn_digits`: `{{ '2026' | bn_digits }}` gives ২০২৬.
  - `img: <width>`: an optimised image URL (Cloudinary resize).
  - `markdown`: simple Markdown (bold, italic, links, lists, headings), escape-safe.
  - `days_until`: whole days until a date (negative when past).
  - `escape` is **on by default**. Use `{{ x | raw }}` for trusted HTML such as rich-text fields; the result is still sanitised.
- **Tags:** `{% collection "notices" limit:5 sort:"-publishedAt" as notices %}` queries data directly.
  - Options: `limit` (1–50), `sort` (`"field"` or `"-field"`), `q` (search), `page`, `include` (relations), `filter.<field>` (equals) and `filter.<field>.<op>`, where `<op>` is `eq ne in contains gt gte lt lte has`.
  - Values are `"text"`, numbers, or a variable such as `item.department` or `url.query.q`. An empty value drops that filter.
  - `as <name>` is optional; it defaults to the collection key.
  - At most 8 queries per module. Fields and ops are the ones in FEATURES_V4_PLAN §8.6.
  - Example: `{% assign today = 'now' | date: '%Y-%m-%d' %}{% collection "events" limit:6 sort:"startDate" filter.startDate.gte:today as events %}`.
  - Not available: `include`, `render` and `layout` (modules have no files).
- **CSS:** each copy of a module is wrapped in `<div data-module="…">`, and every selector is prefixed with it.
  - `:root`, `html` and `body` mean the module itself.
  - `@media`, `@supports` and `@container` work as usual.
  - `@import` is removed.
  - The theme variables from §6 are available.
- **Safety:**
  - Output passes through the HTML sanitiser (no scripts, forms or `<style>`; iframes only from the embed allow-list), with a 15-second render limit and a 256 KB output cap.
  - Data comes only from the public, whitelisted collections, so **no student data**, and the same privacy rules apply.
- **JavaScript:** with JS the rendered HTML, CSS and JS run in the sandboxed frame (§5.1). `SITE.lang`, `SITE.data()` and `SITE.navigate()` are available. The *Admission banner* starter is an example (a live countdown).

### 7.4 Starter library
**Modules → Starter library → Install** adds an editable draft. Publish it to use it.

| Starter | What it shows |
|---|---|
| Teacher spotlight | §7.2 |
| Notice ticker | Scrolling latest notices (pauses on hover; still for reduced motion) |
| Event calendar strip | Next upcoming events as date cards (uses `{% collection %}`) |
| Result highlights | Pass rate / GPA 5 per class for the latest exams (small classes hidden) |
| Admission banner | Banner with a live countdown to the deadline and an apply button (JS, sandboxed) |
| FAQ accordion | Questions and answers (repeater, Markdown answers, no JS) |
| Pricing / fee cards | ৳ fee or package cards with feature lists and a highlighted card (repeater) |

### 7.5 For developers
- **Page data:** `{ "type": "CustomModule", "props": { "moduleKey": "teacher-spotlight", "version": null, "values": { "heading": "…", "headingBn": "…" } } }`.
  - Bangla twins are stored as `<key>Bn`.
  - A collection field's value is an optional override: `{ collection, limit, sort, filters }`.
  - The palette's per-module entries (`CustomModule__<key>`) exist only inside the editor; pages are always saved as `CustomModule`.
- **API:**
  - Admin, under `/api/v1/sites/modules`:
    - `GET`/`POST` the list.
    - `GET`/`PUT`/`DELETE /:id` (`?force=true` deletes a module that is in use).
    - `POST /:id/publish`.
    - `GET /:id/versions`, `POST /:id/versions/:versionId/restore`.
    - `GET /:id/export`, `POST /import`, `POST /validate`.
  - Public:
    - `GET /api/v1/public/sites/:siteId/modules` returns published snapshots only; drafts need a preview token plus `?drafts=1`.
    - `GET …/modules/:key/versions/:n` returns one pinned version.
- **Website developer permission (hook):** besides ADMIN/SUPER_ADMIN, any user whose id is in the site's `settings.websiteDeveloperUserIds` can edit modules. A UI for this comes with the planned "Website developer" role.
- **Export format:** `{ "format": "peoplenit-site-module", "formatVersion": 1, "module": { key, name, nameBn, description, category, icon, fields, template, css, js } }`.
- **Code:**
  - Renderer: `frontend/src/site/modules/*` (`engine.ts` Liquid, `cssScope.ts`, `puckFields.ts`, `CustomModule.tsx`, `starters.ts`).
  - Admin screens: `frontend/src/pages/website/modules/*` and `tabs/ModulesTab.tsx`.
  - Backend: `backend/src/modules/sites/sites.modules.*`.
  - Tests: `frontend/src/site/__tests__/modules-logic.test.ts` and `backend/tests/sites-modules.test.ts`.

## 8. Troubleshooting
| Problem | Fix |
|---|---|
| "Could not load your website / needs migration …" | The backend runs newer code than the database it points to. Locally, start with `scripts\dev-local.cmd sms_preview` (local DB), never with `backend\.env` (production). |
| Teachers don't appear | Turn on **Show on website** in Profile → Staff. |
| Toppers list is empty | Turn on **Show toppers** in Settings, and record student public consent. |
| Hotlines or links not showing | Fixed on `Habib` (admin screen saved `phone`/`url`, blocks read `number`/`href`). Deploy the latest build. |
| A Custom Code block shows nothing | Check the browser console inside the block. Only the sources listed in §5.1 are allowed in `SITE.data()`. |
| A custom module shows nothing on the live site | Publish the module (Modules tab). In the page editor the block shows the Liquid error and its line; the public site shows nothing instead of an error. |
| A module is missing from **My modules** | Only published modules are listed. Publish it, then reopen the page editor. |

## 9. Where the code lives
| Area | Path |
|---|---|
| Block list, palette categories | `frontend/src/site/config.tsx` |
| Blocks | `frontend/src/site/blocks/*.tsx` |
| Binding and visibility | `frontend/src/site/bindable.tsx`, `binding.ts`, `scopeContext.tsx`, `editor/*` |
| Public renderer, routes | `frontend/src/site/render.tsx`, `PublicSite.tsx`, `routes.ts`, `public/*` |
| Sandbox and SITE bridge | `frontend/src/site/code/SandboxFrame.tsx`, `codePage.ts` |
| Custom modules (Liquid) | `frontend/src/site/modules/*`, `frontend/src/pages/website/modules/*`, `backend/src/modules/sites/sites.modules.*` |
| Templates | `frontend/src/site/templates/*` |
| Admin screens | `frontend/src/pages/website/**` |
| Backend (admin + public API, collections) | `backend/src/modules/sites/**` |
| API contracts | `docs/redesign/WEBSITE_BRIEF.md`, `WEBSITE_V2_BRIEF.md`, `WEBSITE_V3_PLAN.md` §7, `docs/plans/FEATURES_V4_PLAN.md` §8 |
| Demo site script | `backend/scripts/demo-site/build-demo-site.ts` |
