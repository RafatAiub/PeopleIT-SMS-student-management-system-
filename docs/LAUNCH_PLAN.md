# PeopleNIT SMS — Launch Plan (development → production)

Owner: lead engineer / BA. Date: 2026-09-29. Built from five audits: engineering readiness, role/tenant security, website-builder security, the `main`↔`Habib` merge plan, and a product/market gap analysis. Status markers: ✅ done · 🔜 next · ⏳ later.

## Where we stand
- **Features: broad and real.** 50 backend modules, 410 pages, and no stub modules.
- **CI: green locally from an empty database.** Lint, typecheck, full migration replay, 1,008 backend tests, frontend tests and build all pass.
- **Blockers:** security fixes, the branch merge, and a short list of Bangladesh-specific outputs schools expect: the tabulation sheet, the admit card, Bangla PDFs and the 4th-subject rule.

## Phase 0 — urgent (done today)
| # | Item | Status |
|---|---|---|
| 0.1 | Demo logins on production (`schooladmin@` / `teacher@peopleit.com`) had the public password `admin123`. Rotated, and 129 sessions revoked. | ✅ |
| 0.2 | **A tenant ADMIN could list another school's users** (`GET /users?institutionId=`). Fixed on `Habib` (`c2b1dd1`) with a regression test. Hotfix branch `hotfix/users-tenant-isolation` is built from `main`; **owner to push and deploy it now.** | ✅ code · 🔜 deploy |

## Phase 1 — engineering MUST (before anyone else uses production)

### A. Merge and data
| # | Item | Size |
|---|---|---|
| A1 | Merge `origin/main` into `Habib` following the merge plan. Picks: staff attendance = Habib's (with a data-converting migration); exam editor = main's `ExamTimetable`, and Habib's view becomes "Exam Routine"; grading, fees, campaigns and website = Habib's, keeping main's data. Sidebar is the union of both. | L |
| A2 | Unpublished results must not leak. Add `exam.isPublished` filters to the AI assistant, the public site, transcript, public API and export. | S |
| A3 | Fix `LeaveRequest.leaveTypeId` FK drift (schema says SET NULL, migration created RESTRICT). | S |

### B. Security
| # | Item | Size |
|---|---|---|
| B1 | Rate limits keyed by user or email as well as IP, stored in Redis; refresh limit raised to about 60 per 15 minutes. **Otherwise a whole school behind one IP gets locked out.** | S |
| B2 | Dependencies: upgrade `multer`; replace `xlsx` 0.18.5 (prototype pollution) with SheetJS 0.20.3+ or `exceljs`; restrict uploads to `.xlsx`/`.csv`. | S |
| B3 | Refresh tokens: reuse detection (revoke the whole token family), an atomic revoke, and honour `JWT_REFRESH_EXPIRES_IN`. 2FA: cap attempts at about 5 per challenge and block replay of a used code. | S |
| B4 | Production env checks: require `ENCRYPTION_KEY` and `QR_SECRET`, require distinct non-example JWT secrets, and require `EMAIL_WEBHOOK_TOKEN` whenever `BREVO_API_KEY` is set. Sync `.env.example` with what the code actually reads (drop dead variables; `FEE_DEMO_PAYMENTS_ENABLED=false`). | S |
| B5 | CORS: allow localhost only outside production; make a rejected origin return 403, not 500. Add a Content-Security-Policy for the dashboard. | S |
| B6 | SSRF: the logo fetch in PDFs must go only to allowed hosts. Restrict the Cloudinary unsigned preset (formats, size) or move to signed uploads. | S |
| B7 | Website builder:<br>• server sanitiser becomes an allowlist parser (`sanitize-html`)<br>• custom domains need the TXT ownership token<br>• learner accounts need email verification before claiming or registering<br>• per-site daily cap on outgoing emails<br>• results lookup: per-roll lockout and one generic error<br>• routine teacher names respect `showOnWebsite`<br>• order numbers get ≥8 random bytes, and email is kept out of URLs<br>• dedicated limit for `caddy-ask`<br>• admission-circular public fields whitelisted<br>• teachers see only their own drafts | M |
| B8 | Roles:<br>• no approving your own leave<br>• `requireTenant` on every tenant router<br>• `/users/search` limited to staff roles<br>• finish the resource-access (IDOR) sweep of unreviewed modules: students, promotion, campaigns, timetables, enquiries, reports | M |
| B9 | Seeds refuse to run when `NODE_ENV=production`. Remove `admin123` from `README` and the docs. Remove `scratch/` and `test-ui.js` from the repo. | S |
| B10 | Tests load their own `.env.test`, never `backend/.env` (production). | S |

### C. Reliability and operations
| # | Item | Size |
|---|---|---|
| C1 | `/ready` endpoint that checks the database and Redis. Handlers for `unhandledRejection`/`uncaughtException`. Wire up Sentry (install `@sentry/node`). | S |
| C2 | Schedulers safe with 2+ instances (Postgres advisory locks): email retry sweep, data-export, campaign timer. Clean shutdown closes queues and idle connections. | S |
| C3 | Page-size cap (1–100) on every list endpoint. | S |
| C4 | Frontend: clear the React Query cache on logout. PWA precaches only the app shell. `frontend/.env.local` must not force `NODE_ENV=development`. Error boundary on public and login pages; a real 404 page. | S |
| C5 | Logs: strip `?token=` from access logs; Brevo webhook authenticates by header. | S |
| C6 | CI runs on every branch. Fix the API Dockerfile build. Commit `deploy/`, `.dockerignore` and the updated workflows. Take a backup before `--migrate` in `deploy.sh`. | S |

## Phase 2 — product MUST (what a Bangladeshi school rejects the product without)
| # | Item | Why | Size |
|---|---|---|---|
| P1 | **Tabulation sheet** (class-wide marks, GPA, pass/fail, position; print and PDF) | Printed after every exam; every competitor has one | M |
| P2 | **4th/optional-subject GPA rule** plus creative/MCQ/practical mark components (2026 SSC pattern) | Grade 9–10 GPAs are wrong without it | M |
| P3 | **Admit card generator** (per exam, bulk, with photo and QR) | Needed every term; School360 has it | S |
| P4 | **Bangla-capable PDFs** (report card, ID card, admit card, tabulation) | Today's PDFs use Helvetica, so Bangla names print as boxes. See decision D1. | M |
| P5 | **SMS:**<br>• honest status when SMS is off (it reports "sent" today)<br>• masked sender ID<br>• a second provider as fallback<br>• **per-school SMS credit wallet** | Guardians expect SMS, and without a wallet the platform pays every school's SMS bill | M |
| P6 | **Terms, Privacy and Refund pages** plus a consent notice; tenant data deletion request | Payment gateways require them; Personal Data Protection Ordinance 2025 | S (plus lawyer review) |
| P7 | Institution application form: CAPTCHA (Cloudflare Turnstile, free) and a "set your password" link instead of emailing a plaintext password | Public sign-up form is exposed; credential safety | S |
| P8 | Live bKash, Nagad and SSLCommerz: production base URLs, merchant paperwork, one real ৳10 test per gateway | Online fees are the top reason schools buy | S (plus paperwork) |

## Phase 3 — go live
1. Deploy the merged code; take a backup, run the one forward migration, check row counts (see the merge plan).
2. Hosting per `docs/deploy/CONTABO_GUIDE.md`: VPS, Docker, Caddy, CI/CD with an approval step; test a backup restore.
3. Production `.env`: `EMAIL_FROM=no-reply@eoncodigital.com`, `BREVO_API_KEY`, `EMAIL_WEBHOOK_TOKEN`, Brevo webhook, `FEE_DEMO_PAYMENTS_ENABLED=false`.
4. A native Bangla speaker reviews the Bangla email and UI copy.
5. **Developer onboarding guide**: how any developer runs the project locally (Phase 4, after this work).

## SHOULD — within 3 months of launch
- **Certificates:** testimonial, transfer certificate, studentship certificate (Bangla wording).
- **Accounts:** basic accounting (income, expense, vouchers, cash book).
- **Student fields:** board registration and roll, birth-registration number, Bangla name, father and mother names.
- **Billing:** subscription invoice PDF with VAT; enforce plan limits beyond student count.
- **Sales and trust:** platform landing and pricing page; tenant-facing audit-log viewer.
- **Government reporting:** BANBEIS/EMIS data export. The 2026 survey runs 1–31 October, so this doubles as a marketing hook.
- **Mobile:** PWA icons and push notifications.

## LATER
- Native Android app.
- Payroll: MPO share, provident fund, bank advice sheet.
- Hostel module.
- Biometric or RFID attendance.
- Live GPS for transport.
- WhatsApp.
- Moving Postgres off Neon (plan written).

## Owner decisions (answered 2026-09-30)
- D1: **Server-side Chromium** renders PDFs from HTML, which fixes Bangla. It runs on the VPS.
- D2: **Prepaid SMS credits** per school. Keep Greenweb and add one backup provider.
- D3: **Cloudflare Turnstile** is the spam check on the public forms.
- D5: **Start building:** Phase 1, then Phase 2.
- D4 (legal pages): still needs the company's legal name, address and contact details.

## Original decision list
| # | Decision | Recommendation |
|---|---|---|
| D1 | How to make Bangla PDFs. `pdfkit` can't shape Bangla conjuncts correctly. | Render PDFs from HTML with headless Chromium on the server: correct Bangla, and the same templates as the screen. Needs the VPS, not Vercel or cPanel. Fallback: print from the browser. |
| D2 | Second SMS provider and how schools pay for SMS | Keep Greenweb and add one more (e.g. MiMSMS or SSL Wireless). Schools **prepay SMS credits** from the dashboard (bKash or SSLCommerz); sending stops at zero, with a warning at 10%. |
| D3 | CAPTCHA provider | Cloudflare Turnstile (free, privacy-friendly) |
| D4 | Legal pages | I draft Terms, Privacy and Refund from your company details; a lawyer reviews before launch |
| D5 | Order of work | Phase 1 (merge + security) first, then Phase 2 product items, then go-live |
