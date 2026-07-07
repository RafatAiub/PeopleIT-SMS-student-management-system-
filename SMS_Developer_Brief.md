# PeopleIT SMS — Developer Technical Brief

**Product:** AI-Powered Student Management System (SaaS)
**Target users:** Schools, colleges, universities, kindergartens, coaching centres (Bangladesh + select international markets)
**Type:** Multi-tenant SaaS platform, mobile-friendly, configurable per institution

---

## Recommended Tech Stack

- **Frontend:** React
- **Backend:** Node.js (Express)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Caching / Queues:** Redis + BullMQ
- **School website builder feature:** Next.js

---

## 1. Core Modules

| Module | Key Features |
|---|---|
| Student Information | Admissions, enrolment, student profiles, document uploads, custom fields, batch/class management |
| Teacher Portal | Attendance entry, result upload, student dashboard access, assignments, class notes, tasks |
| Guardian Portal | Live notifications, child progress tracking, fee alerts, messaging, attendance alerts, notices |
| Fee & Billing | Invoice creation, online/offline payment tracking, due reminders, fee categories, payment history, receipts |
| Attendance | Daily & subject-wise attendance, QR code check-in, absence alerts, late marks, summaries |
| Academic Results | Exam setup, marks entry, grading, report cards, transcripts, progress reports, rank generation |
| Timetable & Classes | Visual timetable builder, class scheduling, subject-teacher assignment, conflict checks |
| HR & Payroll | Staff profiles, salary structures, payslips, leave management, payroll reporting, staff attendance |
| Library Management | Book catalogue, issue/return tracking, overdue fines, inventory, borrowing history |
| Transport Module | Route management, vehicle records, student bus assignment, driver details, route reporting |
| Communication Hub | Bulk SMS, email, in-app push notifications, announcements, notice board, group messaging |
| Reports & Analytics | Dashboards, financial/attendance/academic reports, PDF/Excel export |
| Admin Configuration | Multi-branch support, role-based access, permissions, custom branding, institution settings |

## 2. Full Feature Scope (by area)

- **Institution Setup:** Multi-tenant setup, branch/campus config, academic year setup, classes, sections, departments, subjects, grading rules, branding
- **User & Role Management:** Admin, teacher, accountant, librarian, transport officer, guardian, student, management roles with permission control
- **Admission & Enrolment:** Online admission forms, enquiry capture, profile creation, document collection, approval workflow, roll number generation, status tracking
- **Student Profile & Records:** Personal/guardian details, emergency contacts, medical notes, documents, previous school history, academic records, activity timeline
- **Attendance Management:** Daily/subject-wise, QR attendance, late/absent tracking, guardian alerts, register, monthly summaries
- **Academic Management:** Exam setup, marks entry, result processing, grading, transcripts, report cards, promotion, merit lists, progress dashboards
- **Teacher Workspace:** Class list access, attendance entry, lesson notes, assignments, performance review, result upload, guardian communication
- **Guardian & Student Portals:** Fee status, attendance view, result view, notices, messages, homework, class routine, payment history
- **Fees, Billing & Payments:** Fee categories, invoicing, partial payments, concessions/discounts, due reminders, receipts, bKash/Nagad/SSL Commerz integration, offline payment entry
- **Communication Hub:** SMS, email, app notification, notice board, class-specific updates, scheduled messages
- **Timetable & Scheduling:** Class timetable, subject assignment, teacher schedule, room allocation, exam timetable, holiday calendar, conflict detection
- **HR, Staff & Payroll:** Profiles, contracts, leave, attendance, salary setup, payroll processing, payslips, allowances, deductions, reports
- **Library Management:** Catalogue, stock, issue/return, overdue tracking, fines, borrowing history, reports
- **Transport Management:** Routes, stops, vehicles, drivers, student assignment, transport fees, route reports, optional live tracking readiness
- **Inventory & Assets:** School assets, stock tracking, purchase records, allocation, maintenance, basic reports
- **Reports & Dashboards:** Management/finance/attendance/academic dashboards, student growth, payment dues, teacher workload, exportable reports
- **Integrations:** Payment gateway, SMS gateway, email service, website forms, WhatsApp-ready workflow, Google Sheets export, future API access
- **Security & Compliance:** Role-based access, activity logs, secure login, password policy, backups, encryption, audit trail
- **Support & Onboarding Tools:** Setup wizard, sample data import, user guides, training access, ticket support, onboarding checklist

## 3. AI / Automation Feature Suite

| Feature | Purpose |
|---|---|
| AI Admission Enquiry Assistant | Answers admission questions, captures leads, recommends class/programme, routes enquiries |
| AI Guardian Support Chatbot | 24/7 answers on fees, attendance, results, routine, holidays, notices |
| AI Academic Risk Scoring | Scores students on attendance, grades, late marks, missed assignments, behaviour |
| AI Fee Collection Risk Alerts | Predicts late payments, plans reminder timing |
| AI Report Card Comment Generator | Drafts performance comments for teacher review/edit |
| AI Attendance Pattern Detection | Finds repeated absence patterns, sudden drops, class-level trends |
| AI Communication Drafting | Drafts SMS/email/app notification templates |
| AI Dashboard Insight Summary | Turns dashboard data into plain-language management summaries |
| AI Teacher Workload Insight | Flags overloaded teachers, timetable pressure, coverage issues |
| AI Enrolment Forecasting | Forecasts demand by class/branch/programme from historical data |
| AI Knowledge Assistant | Natural-language search over policies, procedures, fee rules |
| AI Data Clean-Up Suggestions | Finds duplicate students, missing/incomplete guardian data |

## 4. Release Plan

| Stage | Feature Focus |
|---|---|
| **MVP** | Institution setup, student profiles, guardian profiles, fee tracking, attendance, basic results, communication, dashboard, Android app readiness, admin controls |
| **Pilot Release** | Teacher portal, guardian portal, payment gateway, QR attendance, report cards, SMS/email automation, pilot data import |
| **Full Product** | AI features, HR/payroll, library, transport, advanced analytics, iOS app, multi-branch controls, API-ready structure |
| **Enterprise** | Custom branding, multi-campus reporting, SLA support, advanced security, custom workflows, enterprise integrations |

## 5. Development Phases (timeline only, no cost)

| Phase | Duration | Deliverables |
|---|---|---|
| Phase 1 | Month 1 | Architecture, DB design, UI/UX wireframes, institution setup, student/guardian modules, basic billing |
| Phase 2 | Months 2–4 | Attendance, results, timetable, teacher portal, Android app, payment gateway, communication hub |
| Phase 3 | Months 5–6 | AI prototype, library, transport, analytics dashboard, report cards, onboarding tools, security hardening |
| Phase 4 | Months 7–10 | iOS app, multi-language support, enterprise features, API access, advanced AI, international readiness |

## 6. Payment Gateways to Integrate

bKash, Nagad, SSL Commerz (Bangladesh), plus offline payment entry support.

## 7. Security & Compliance Requirements

- Role-based access control across all user types (admin, teacher, accountant, librarian, transport officer, guardian, student, management)
- Activity logs and user audit trail
- Secure login, password policy
- Data backup and encryption
- Permission-based reporting access

---

*Excludes: pricing model, investment figures, revenue projections, shareholding/equity structure, and other business/financial content from the original investor proposal.*
