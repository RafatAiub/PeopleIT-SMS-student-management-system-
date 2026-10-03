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
