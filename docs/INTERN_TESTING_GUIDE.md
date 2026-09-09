# PeopleNIT SMS — Intern Testing Guide

**What you are testing:** the new **notification bell** and the **subscription billing**
screens (both the institute-admin side and the super-admin side) that were built over the
last two weeks, plus a quick 10-minute check that the rest of the app still opens.

**How long it takes:** about 2 to 3 hours if nothing is badly broken.

**What you need:** a laptop, Google Chrome or Microsoft Edge, and this document. Nothing to
install.

**When you are done:** fill in the **Report Template** at the bottom of this file (Section 9)
and send it back with your screenshots.

---

## 0. Read this first

### 0.1 The app

- Website: **https://peopleitsms.vercel.app**
- You only use a browser. Do not install anything.

### 0.2 Cold start — do not panic

The server goes to sleep when nobody uses it. **The first page you open, and the first action
after a quiet few minutes, can take 30 to 60 seconds.** You may see a message like "Server is
waking up, retrying...". This is normal. Wait up to a minute. Do not hammer the refresh
button. If something fails on the very first try, wait 60 seconds and try once more before
you call it a bug.

### 0.3 Login accounts

Every account uses the password: **`admin123`**

The login screen asks for **Email**, **Password**, and then an **Institution** (a dropdown).

| Role you will act as | Email | Institution to pick |
|---|---|---|
| **Super Admin** (platform owner) | `admin@peopleit.com` | choose **"Global Admin"** |
| **School Admin** (runs one school) | `schooladmin@peopleit.com` | choose **"Dhaka City School (102030)"** |
| **Teacher** | `teacher@peopleit.com` | **"Dhaka City School (102030)"** |
| **Student** | `student@peopleit.com` | **"Dhaka City School (102030)"** |

> **Tip — two roles at once.** Several tests need you logged in as two roles at the same
> time (for example School Admin *and* Student). Do this:
> - Normal browser window: log in as one role.
> - **Incognito / InPrivate window** (Ctrl+Shift+N in Chrome, Ctrl+Shift+P in Edge): log in
>   as the other role.
> Keep both windows side by side.

### 0.4 How to record your results

1. Open the **Report Template** (Section 9 of this file) in a separate document. Copy it so
   you can type into it.
2. For every test (they have IDs like `L1`, `N3`, `B4`), write one of: **PASS**, **FAIL**,
   **BLOCKED**, or **SKIPPED**, plus a short note.
3. Take a screenshot whenever something looks wrong, **and** for a few "it worked" moments so
   we can see it.
   - Screenshot the **whole browser window**, including the **address bar** (the URL matters).
   - Save screenshots in one folder, named by test ID, e.g. `B4-fail.png`.
4. For every **FAIL** or **BLOCKED**, also fill in a numbered **Bug** entry (there is a
   template for that in Section 9).

### 0.5 Severity — how bad is a bug

| Severity | Meaning |
|---|---|
| **Critical** | Blocks a core task completely. Data loss. Money charged wrongly. A whole screen is unusable. Anyone can see another school's data. |
| **High** | An important feature is broken or gives a wrong result, but there is a workaround, or it only hits one role. |
| **Medium** | Feature works but behaves oddly: confusing message, wrong label, layout broken on mobile, slow. |
| **Low** | Cosmetic. Typo. Minor spacing. Nice-to-have. |

### 0.6 KNOWN LIMITATIONS — do NOT report these as bugs

These are **already known and are intentional for now.** If you see them, do not log a bug.
You may mention them once in the "Anything confusing" section if you want.

- **Emails and text messages (SMS) are never actually sent anywhere.** The app may say
  "email sent" or record an email — that only means it was written down internally. The only
  notification you can really see is the **in-app bell**.
- **Marking a student absent does NOT create a bell notification.** Neither do fee-due
  reminders. That part is not wired to the bell yet.
- **Student online payment buttons** (bKash, Nagad, card) on the student's own Fees page are
  **placeholders**. They will not complete a real payment. The only working "payment" is the
  admin-side **"Record Payment"** (an offline/manual payment).
- **The subscription checkout uses SSLCommerz "sandbox" (test) mode.** No real money moves.
  Use the test card in **Appendix A**.
- **The Super Admin may get an error on a few settings pages** (for example a "Website"
  settings page). Note it if you hit it, but it is a known issue, not something you found.
- **"AI Insights" numbers are rule-based**, not a real AI. Not a bug.
- There is **no screen to change notification preferences**. That is not built yet.

### 0.7 Cleanup rule

Some tests change real data on the demo school (suspending it, extending its subscription,
creating a plan). **Each of those tests tells you how to undo it. Always do the undo step.**
At the very end, Section 5 has a cleanup checklist. If you cannot undo something, write it
clearly in your report under "Things I could not undo".

---

## 1. Warm-up and login  (about 10 minutes)

| ID | Steps | Expected result |
|---|---|---|
| **L1** | Open https://peopleitsms.vercel.app | The login page loads (email, password, institution fields). Remember it may take up to 60s the first time. |
| **L2** | Log in as **School Admin** (`schooladmin@peopleit.com` / `admin123` / "Dhaka City School (102030)"). | You land on a dashboard. A sidebar/menu is visible on the left. No error message. The top-right header has a **bell icon** and your account. |
| **L3** | Open an **incognito window**. Log in as **Student** (`student@peopleit.com` / `admin123` / "Dhaka City School (102030)"). | You land on a student view (likely a student list or the student's own info). Sidebar has student-level items only. |
| **L4** | Open one more window (or reuse one). Log in as **Super Admin** (`admin@peopleit.com` / `admin123` / choose **"Global Admin"**). | You land on a platform dashboard. The sidebar has a **"Platform Control"** area that includes a **"Billing"** link. |

If any login fails after a proper 60-second wait and a second try, that is a **FAIL** — record
the exact error text and a screenshot.

---

## 2. Notification bell — basics  (about 20 minutes)

Do this section as the **Student**.

> If the Student's bell has **no notifications at all**, do **Section 3 first** (it creates
> some), then come back here.

| ID | Steps | Expected result |
|---|---|---|
| **N1** | As Student, look at the top header on any page. Move between 2 or 3 pages. | A **bell icon** is always there, on every page. |
| **N2** | Look at the bell. | If there are unread notifications, a small badge with a **number** sits on the bell. If there are more than 9, it shows **`9+`**. If there are zero unread, there is **no badge at all**. Write down what you see. |
| **N3** | Click the bell. | A dropdown opens. It lists recent notifications, **newest at the top**. Each row has: a small icon, a title, a short line of text, and a relative time like "5m ago" or "2h ago". |
| **N4** | In the dropdown, click **one notification that is unread** (unread ones are usually highlighted or have a dot). | Three things happen: (a) that item stops looking "unread", (b) the dropdown closes, (c) the page navigates somewhere relevant. For a fee notification it should take you to the **Fees** page. |
| **N5** | Click the bell again. | The item you just clicked now shows as **read** (no highlight/dot). The number badge went **down by 1** (or disappeared if that was the last one). |
| **N6** | Click **"Mark all read"** in the dropdown. | Every item loses the unread style. The number badge disappears. |
| **N7** | Reload the whole page (press F5). Open the bell again. | The read / unread state is **exactly the same as before the reload**. (The state is saved on the server, not just in your browser.) |
| **N8** | Leave the Student window open. After you create a new notification in Section 3, **do not reload** — just wait. | Within about **60 seconds** the badge updates on its own. |

---

## 3. Fee events create a notification for the Student  (about 25 minutes)

You need **two windows**: **School Admin** (normal) and **Student** (incognito).

| ID | Steps | Expected result |
|---|---|---|
| **F1** | In the **School Admin** window, open **"Fees & Billing"** from the sidebar (URL ends in `/fees`). | A list of invoices loads. Somewhere you can see the demo student **"Demo Student"** / ID **`STU-DEMO-001`**. |
| **F2** | Click the button to **create a new invoice** (label may be "Create Invoice", "New Invoice", or a "+"). Fill it in: pick **Demo Student**, add at least one line/fee item with an **amount** (e.g. 500), set a **due date** in the future, then **Save**. | A success message appears. The new invoice shows in the list with the amount you entered. |
| **F3** | Switch to the **Student** window. Wait up to **60 seconds** (or reload once). Open the bell. | A **new unread notification** appears at the top, about a **new invoice**. Open it: the text mentions the **amount** and the **due date**. Clicking it takes you to the **student's Fees page**, where the **same invoice** is listed. |
| **F4** | Back in the **School Admin** window, open that invoice and use **"Record Payment"** (this is the manual / offline payment). Enter an amount (part or all), and **Save**. | A success message. The invoice's paid amount / balance updates. |
| **F5** | Switch to the **Student** window. Wait up to **60 seconds**. Open the bell. | A **second new notification** appears — something like **"Payment received"**. On the student's Fees page, the invoice balance reflects the payment you recorded. |
| **F6** | (Negative check — nothing to click.) | Confirm you understand: the **guardian does not get a separate notification**. Fee notifications go **only to the student's own login**. That is **by design**, not a bug. |

---

## 4. Institute-Admin billing screen  (about 30 minutes)

Do this as the **School Admin**. Open **"Subscription"** from the sidebar (URL ends in
`/billing`).

| ID | Steps | Expected result |
|---|---|---|
| **B1** | Look at the top "status" panel (the big coloured box). | It shows the current **plan name**, the **billing cycle** (Monthly/Quarterly/etc.), a **status** word (Active, Trial, Grace, Expired, or Cancelled), and a **date** ("Renews on..." or "Trial ends..." or "Suspends on..."). **Write down the status word you see.** |
| **B2** | Below, find the **"Choose a plan"** area with a row of plan cards and a **cycle switcher** (Monthly / Quarterly / Half-yearly / Yearly). Click through each cycle. | Prices on the cards **change** with the cycle. For cycles longer than Monthly you should see an **"approximately X / month"** line, and sometimes a green **"save NN%"** badge. |
| **B3** | Find the card for the plan you are currently on (for the cycle you are on). | It is marked **"Current"** and its button says **"Renew this plan"** (not "Subscribe"). |
| **B4** | **This is the important one.** Click **"Subscribe"** (or **"Renew this plan"**) on any plan. | You are sent to an **SSLCommerz sandbox payment page**. Now do **one** of these: (a) complete the payment using the test card in **Appendix A**, or (b) cancel it on that page. **Either way, you must end up back in the app** on a page whose URL ends in **`/billing/checkout-result`**, showing "success", "failed", or "cancelled", with a link back to billing. |
| **B4-FAIL** | If after the SSLCommerz step you get stuck on: an error page, a blank page, a "cannot reach this site", or you never come back to `/billing/checkout-result` — | **Screenshot the full window including the address bar.** Mark **B4 = FAIL**. In your bug note, write the **exact URL** shown. (The team is actively hunting this one.) |
| **B5** | Scroll to the **payment history** table at the bottom of `/billing`. | It lists past payments: date, amount, method, status, and a **"Receipt"** link on each row. |
| **B6** | Click a **"Receipt"** link. | A receipt page opens (URL has `/billing/receipt/`). It shows the school name, amount, plan, cycle, method, and a transaction ID. Click **"Print / Save PDF"** — the browser's print dialog opens and the receipt layout looks clean (no text cut off). Close the print dialog. |
| **B7** | Back on `/billing`, look for a **yellow "Payment requested by PeopleIT"** banner near the top. | It may or may not be there right now. It appears **only after** the Super Admin generates a payment link (you do that in Section 5, step **S11**). Note whether you see it now. After S11, come back and confirm it appeared, with a **"Pay now"** button. |
| **B8** | Make the browser window **narrow** (drag it to phone width, or press F12 and turn on the device toolbar, pick "iPhone"). Look at `/billing`. | The status panel text is **not cut off in the middle of a sentence**. Buttons stack neatly. The page does **not** scroll sideways. |
| **B9** | Scan the whole `/billing` page. | No crash. No raw error text. Nowhere does it show the words **"undefined"**, **"null"**, or **"NaN"**. |

---

## 5. Super-Admin billing portal  (about 40 minutes)

Do this as the **Super Admin** ("Global Admin"). Open **"Billing"** under "Platform Control"
(URL ends in `/super-admin/billing`). There are **three tabs**: Subscriptions, Plans,
Analytics.

### 5.1 Plans tab

| ID | Steps | Expected result |
|---|---|---|
| **S1** | Open the **Plans** tab. | A set of plan cards, each showing prices per billing cycle. |
| **S2** | Click **"New plan"** / **"Create plan"**. Fill in: name **"Intern Test Plan"**, a slug (e.g. `intern-test-plan`), a student cap number, a short description, an order number. **Save**. | The new plan **"Intern Test Plan"** appears in the list. |
| **S3** | Click **edit** on "Intern Test Plan". Change the description text. **Save**. | The card shows the new description. |
| **S4** | On "Intern Test Plan", set a **price** for one cycle (e.g. Monthly = 1000). **Save**. | The price shows on the card. |
| **S5** | **Archive** "Intern Test Plan" (there should be an archive/delete action; it will ask you to confirm). | After confirming, "Intern Test Plan" disappears from the active list. |

### 5.2 Subscriptions tab

| ID | Steps | Expected result |
|---|---|---|
| **S6** | Open the **Subscriptions** tab. | A table of institutions: name, plan, cycle, status, and a period-end / grace-end date. |
| **S7** | In the search box, type **`Dhaka`**. Wait a moment (it waits until you stop typing). | The table filters down to matching institutions (Dhaka City School). |
| **S8** | Use the **status filter** dropdown — pick "Active", then "All statuses". | The list filters to only that status, then shows everything again. |
| **S9** | If there are many rows, use the **pagination** controls at the bottom (next / previous / page numbers). | Moving pages changes the rows shown. |
| **S10** | On the **Dhaka City School** row, click **"Manage"**. | A **detail popup (modal)** opens. It contains: a summary strip (plan / status / cycle / period-end), a **payment history** table, a **"Generate payment link"** section, and a **"Manual override"** form. |

### 5.3 Detail popup — actions (all on Dhaka City School)

> Keep a **School Admin** window open in incognito for the notification checks below.

| ID | Steps | Expected result |
|---|---|---|
| **S11** | In **"Generate payment link"**, pick a plan and a cycle, then click **"Generate"**. | A **payment URL** appears that you can copy. *(Optional: paste it in a new tab — it should open an SSLCommerz sandbox page. You do not have to complete it.)* |
| **S11-check-a** | Switch to the **School Admin** window, open `/billing`. | The **yellow "Payment requested by PeopleIT"** banner now appears, with a **"Pay now"** button. (This is test **B7**.) |
| **S11-check-b** | Check the **bell** in the **School Admin** window, and also in the **Super Admin** window. Wait up to 60 seconds. | **Both** get a new notification like **"Payment requested"**. |
| **S12** | Back in the detail popup, in **"Manual override"**: action = **"Extend period"**, days = **30**, reason = **"intern test extend"**. Click **Apply**. | Success message. The popup refreshes or closes. The subscription's **period-end date moved about 30 days later**. Within 60s, **both** the School Admin and Super Admin bells get a **"Subscription updated"** notification. |
| **S13a** | In "Manual override": action = **"Force suspend"**, reason = **"intern test suspend"**. Apply. | Status becomes **Expired / Suspended**. Within 60s, both bells get an **"Account suspended"** notification. |
| **S13b** | **Immediately** do it again: action = **"Force reactivate"**, days = **30**, reason = **"intern test undo"**. Apply. | Status goes back to **Active**. **Do not skip this step** — otherwise the demo school is left suspended for everyone. |
| **S14** | **Refund — only do this if the team specifically asks.** In the payment-history table inside the popup, a SUCCESS payment has a refund icon. If asked: enter an amount + reason, confirm. There is also a "check refund status" action. | Record whatever happens (success, error text, "processing"). This hits the SSLCommerz sandbox refund system, so results can be slow. |

### 5.4 Analytics tab

| ID | Steps | Expected result |
|---|---|---|
| **S15** | Open the **Analytics** tab. (It may take a second to load a chart.) | You see **4 stat tiles** (MRR, Total revenue, Churned, Upcoming renewals) and a **"Revenue by plan"** bar chart. The **"Churned"** tile has a **"Last 30 / 60 / 90 days"** selector — change it and the number reloads. |

### 5.5 Cleanup checklist (do this before you finish)

| ID | Check | Done? |
|---|---|---|
| **S16a** | Dhaka City School subscription status is back to **Active** with a sensible future date. | |
| **S16b** | "Intern Test Plan" is **archived** (not in the active list). | |
| **S16c** | Write down anything you changed that you could **not** undo. | |

---

## 6. Role boundaries  (about 15 minutes)

The point of this section: a Student or Teacher must **not** be able to reach admin screens,
even by typing the URL directly.

| ID | Steps | Expected result |
|---|---|---|
| **R1** | As the **Student**, click into the browser address bar and go to: `https://peopleitsms.vercel.app/billing` | You do **NOT** see the admin billing page. You are redirected away (to your dashboard or a "not allowed" page). Write down exactly what happens. |
| **R2** | As the **Student**, go to: `https://peopleitsms.vercel.app/super-admin/billing` | Blocked / redirected. Not the portal. |
| **R3** | As the **Student**, go to `https://peopleitsms.vercel.app/students`. Look for a **"Bulk Import"** button. | Whether or not you can see the students page, there is **no "Bulk Import" button** for a student. |
| **R4** | As the **Student**, look at the whole sidebar. | No "Platform Control", no "Billing", no "Subscription", no admin-only items. |
| **R5** | Log in as the **Teacher**. Try the address-bar trick for `/billing` and `/super-admin/billing`. | Both are blocked / redirected. |

---

## 7. 10-minute regression smoke

A fast "did anything obviously break" pass. Do it as the **School Admin** unless noted.
For each page, the only question is: **does it open without a crash, an error screen, or a
spinner that never stops?**

| ID | Page | Expected |
|---|---|---|
| **G1** | Dashboard (the home page after login) | Loads. Numbers / cards render. |
| **G2** | Students (`/students`) | The student table loads. |
| **G3** | Attendance (`/attendance`) | Pick a class and section — the attendance register loads. *(Optional: mark one student absent and submit — you should get a success message. Remember: NO bell notification is expected from this.)* |
| **G4** | Fees & Billing (`/fees`) | The invoice list loads. |
| **G5** | Notices (`/notices`) | Loads. |
| **G6** | Any Reports page in the sidebar | Loads. Charts render (not blank, not broken). |
| **G7** | HR / Staff page | Loads. |
| **G8** | Click **Log out** | You are returned to the login page cleanly (no error, no half-loaded screen). |

---

## 8. How to write your report

1. In the **Report Template** below, go down the **Results table** and put **PASS / FAIL /
   BLOCKED / SKIPPED** next to **every** test ID. Add a short note for anything not a plain
   PASS.
2. For **each FAIL or BLOCKED**, fill in one numbered **Bug** block (there is a blank one to
   copy). Include:
   - which **account / role** you were using,
   - the **page URL**,
   - **numbered steps** to make it happen again,
   - what you **expected**,
   - what **actually happened**,
   - the **screenshot file name**,
   - a **severity** (see 0.5).
3. Fill in the short sections at the end: what you could not test, anything confusing (even
   if not a bug), and your overall impression.
4. Send back: this filled-in file **plus** your screenshots folder.

---

## 9. REPORT TEMPLATE  (copy everything from here down)

```
PeopleNIT SMS — TEST REPORT

Tester name:
Date:
Browser + version:
Operating system:
Environment: Production — https://peopleitsms.vercel.app
Approx. time spent:
Anything I set up specially:


=====================================================================
RESULTS
=====================================================================
Result = PASS | FAIL | BLOCKED | SKIPPED
Severity only needed for FAIL/BLOCKED (Critical | High | Medium | Low)

ID     | What it checks                                   | Result | Severity | Notes / screenshot
-------|-------------------------------------------------|--------|----------|-------------------
L1     | Login page loads                                |        |          |
L2     | School Admin can log in + dashboard             |        |          |
L3     | Student can log in                               |        |          |
L4     | Super Admin can log in + sees Billing nav        |        |          |
N1     | Bell shows on every page                         |        |          |
N2     | Unread badge (number / "9+" / hidden at 0)       |        |          |
N3     | Bell dropdown lists notifications, newest first  |        |          |
N4     | Click unread -> marks read + closes + navigates  |        |          |
N5     | Re-open bell: item read, count dropped by 1      |        |          |
N6     | "Mark all read" clears the badge                 |        |          |
N7     | Reload keeps read/unread state                   |        |          |
N8     | Bell auto-updates within ~60s                    |        |          |
F1     | Admin Fees page loads, demo student visible      |        |          |
F2     | Admin can create an invoice for the student      |        |          |
F3     | Student bell gets "new invoice" + link to Fees   |        |          |
F4     | Admin can Record Payment on the invoice          |        |          |
F5     | Student bell gets "payment received"; balance ok |        |          |
F6     | (Understood) guardian gets nothing - by design   |        |          |
B1     | Billing status panel shows plan/cycle/status/date|        |          |
B2     | Cycle switcher changes prices + per-month line   |        |          |
B3     | Current plan card says "Renew this plan"         |        |          |
B4     | Subscribe/Renew -> SSLCommerz -> back to result  |        |          |
B5     | Payment history table + Receipt links           |        |          |
B6     | Receipt page opens + Print dialog + clean layout |        |          |
B7     | "Payment requested by PeopleIT" banner (after S11)|       |          |
B8     | Narrow window: no clipped text, no sideways scroll|       |          |
B9     | No "undefined"/"null"/"NaN"/raw errors on page   |        |          |
S1     | Super-admin Plans tab lists plans                |        |          |
S2     | Create "Intern Test Plan"                        |        |          |
S3     | Edit that plan's description                     |        |          |
S4     | Set a price on that plan                         |        |          |
S5     | Archive that plan                               |        |          |
S6     | Subscriptions tab shows institution table        |        |          |
S7     | Search "Dhaka" filters the list                  |        |          |
S8     | Status filter works                             |        |          |
S9     | Pagination works                               |        |          |
S10    | "Manage" opens the detail popup                  |        |          |
S11    | Generate payment link -> URL appears             |        |          |
S11-a  | School Admin /billing shows yellow banner        |        |          |
S11-b  | Both Admin + Super Admin bells get "requested"   |        |          |
S12    | Manual override "Extend" moves period-end +30d   |        |          |
S12-n  | Both bells get "Subscription updated"            |        |          |
S13a   | Force suspend -> status Suspended + bells        |        |          |
S13b   | Force reactivate -> status back to Active        |        |          |
S14    | Refund (only if asked)                          |        |          |
S15    | Analytics tab: 4 tiles + chart + churn selector  |        |          |
S16a   | Cleanup: Dhaka City School back to Active        |        |          |
S16b   | Cleanup: Intern Test Plan archived              |        |          |
R1     | Student cannot open /billing                     |        |          |
R2     | Student cannot open /super-admin/billing         |        |          |
R3     | Student has no "Bulk Import" button              |        |          |
R4     | Student sidebar has no admin items               |        |          |
R5     | Teacher cannot open billing pages                |        |          |
G1     | Dashboard loads                                 |        |          |
G2     | Students page loads                             |        |          |
G3     | Attendance register loads (optional submit ok)   |        |          |
G4     | Fees page loads                                 |        |          |
G5     | Notices page loads                             |        |          |
G6     | A Reports page loads, charts render             |        |          |
G7     | HR / Staff page loads                           |        |          |
G8     | Log out returns to login cleanly               |        |          |


=====================================================================
BUGS FOUND  (copy this block for each bug)
=====================================================================

--- BUG #1 ---
Related test ID:
Title (one line):
Severity: Critical | High | Medium | Low
Role / account used:
Page URL:
Steps to reproduce:
  1.
  2.
  3.
Expected:
Actual:
Screenshot file:
Notes:


=====================================================================
THINGS I COULD NOT TEST / WAS BLOCKED ON
=====================================================================
-


=====================================================================
THINGS I CHANGED THAT I COULD NOT UNDO
=====================================================================
-


=====================================================================
ANYTHING CONFUSING OR THAT FELT WRONG  (even if not a clear bug)
=====================================================================
-


=====================================================================
OVERALL IMPRESSION  (2-3 sentences)
=====================================================================


Signed:                          Date:
```

---

## Appendix A — SSLCommerz sandbox test card

The SSLCommerz sandbox page usually shows its own list of test cards and wallets — you can
pick any of those. If you need to type a card:

- Card number: `4111 1111 1111 1111`  (a test VISA)
- Expiry: any date in the **future** (e.g. `12/30`)
- CVV: `111`
- If it asks for an OTP / PIN: `123456`
- Name: anything

**Never enter a real card number.** This is a test gateway; nothing is charged.

---

## Appendix B — Troubleshooting

| Problem | What to do |
|---|---|
| Page is very slow or shows "Server is waking up" | Wait up to 60 seconds. Try once more. Only then treat it as a bug. |
| "Session expired" / you get kicked to the login page | Just log in again and continue. |
| You need to be two roles at once | Normal window = role A. Incognito / InPrivate window = role B. |
| The bell does not update after you created a notification | Wait a full 60 seconds. Then hard-reload: Ctrl+Shift+R. Then check again. |
| A whole section is blocked (e.g. SSLCommerz is down) | Mark those tests **BLOCKED**, write why, and move on to the next section. |
| You are not sure if something is a bug | Write it in "Anything confusing" and let the team decide. Better to over-report than to hide it. |
