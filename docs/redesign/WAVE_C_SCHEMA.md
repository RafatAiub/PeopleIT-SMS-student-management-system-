# Wave C — Feature-Foundation Schema

Additive-only schema changes for all upcoming Wave C feature work, added in one
migration so later feature engineers never need to touch `schema.prisma`
themselves.

**Migration:** `backend/prisma/migrations/20260927000000_wave_c_feature_foundation/migration.sql`

**Migration not applied — run `npx prisma migrate deploy` against staging first.**
This migration has been hand-written (via `prisma migrate diff` between the
pre-Wave-C schema and the new one) and validated with `prisma validate` +
`prisma generate` + `tsc --noEmit`, but it has **not** been run against any
database. Do not run `prisma migrate deploy`/`dev` against production without
first applying it to a staging copy of the database.

## Deviation from spec

The task brief for this migration asked for every new tenant table's
`Institution` relation to use `onDelete: Cascade` ("like existing tenant
tables"). Checking the actual schema, **no existing tenant table** (e.g.
`FeeCategory`, `Invoice`, `Student`, `Attendance`, ...) cascades from
`Institution` — those relations all use the Prisma/Postgres default
(`ON DELETE RESTRICT`). Institutions are never hard-deleted in this codebase
(only `isActive` is toggled), so cascading delete has never been exercised.
To stay consistent with the 30+ existing tenant models and avoid introducing
a new, untested deletion behavior, every new tenant table's `Institution`
relation in this migration also uses the default `RESTRICT` behavior, not
`CASCADE`. Flag if this should change.

`TransportRoute` already has `stops String` (free-text) — the reserved word
`stops` could not be reused for the new `TransportStop[]` back-relation, so
it is named `stopPoints` on `TransportRoute` instead.

`TransportRoute.routeFare` already exists and covers the "route fare" concept
the brief's optional `monthlyFee` would have duplicated, so `monthlyFee` was
not added (per the brief's own "if routeFare exists keep it; add only if
missing" instruction).

`StockItem.categoryId` reuses the new `AssetCategory` model (the brief did not
define a separate stock-category model) — one institution-scoped tag
catalogue shared by fixed assets and consumable stock.

## 1. Institution settings

- `Institution.timezone` — `String @default("Asia/Dhaka")`
- `Institution.dateFormat` — `String @default("D MMM YYYY")`
- `Institution.numeralSystem` — `String @default("latn")`
- `Institution.currency` — `String @default("BDT")`
- `Institution.defaultLanguage` — `String @default("en")`
- `Institution.primaryColor` — `String?`

## 2. Online fee payments

- `enum FeeGateway` — BKASH, NAGAD, SSLCOMMERZ
- `enum FeeTxnStatus` — INITIATED, PENDING, SUCCESS, FAILED, CANCELLED
- `model FeePaymentTransaction` — institutionId, invoiceId, studentId?, gateway, amount, currency, status, gatewayTransactionId (unique), gatewayPaymentId?, gatewayValId? (unique), rawResponse?, initiatedByUserId?, paymentId? (unique, links to `Payment` on success), isDemo, timestamps

## 3. Receipts

- `Payment.receiptNo` — `String? @unique` (tenant-prefixed receipt numbers generated in app code)

## 4. Fee concessions

- `enum ConcessionType` — PERCENT, FIXED
- `model Concession` — institutionId, name, type, value, feeCategoryId?, isActive, description?
- `model StudentConcession` — institutionId, studentId, concessionId, validFrom?, validTo?, note?; unique(studentId, concessionId)

## 5. Fee schedules / bulk invoicing

- `model FeeSchedule` — institutionId, name, classId?, feeCategoryId, amount, frequency, dueDay?, isActive
- `model InvoiceBatch` — institutionId, label, classId?, sectionId?, period, createdByUserId, invoiceCount, totalAmount, status

## 6. Grading scales

- `model GradingScale` — institutionId, name, isDefault
- `model GradeBand` — gradingScaleId, grade, minPercent, maxPercent, gradePoint, remark?; unique(gradingScaleId, grade) — scoped transitively via `gradingScaleId`, no direct `institutionId` (same pattern as `InvoiceItem`/`Payment`)

## 7. Promotion

- `enum PromotionStatus` — PROMOTED, RETAINED, GRADUATED, TRANSFERRED
- `model PromotionRecord` — institutionId, studentId, fromAcademicYearId?, toAcademicYearId?, fromClassId?, toClassId?, fromSectionId?, toSectionId?, status, promotedByUserId, note?

## 8. Attendance extensions

- `model SubjectAttendance` — institutionId, studentId, subjectId?, subjectName, date, period?, status, markedByUserId; unique(institutionId, studentId, date, subjectName, period)
- `model StaffAttendance` — institutionId, staffUserId, date, status, checkIn?, checkOut?, note?, markedByUserId?; unique(institutionId, staffUserId, date)
- `model QrCheckIn` — institutionId, userId, studentId?, scannedAt, method (default "QR"), deviceInfo?

## 9. Payroll components

- `enum SalaryComponentType` — ALLOWANCE, DEDUCTION
- `enum SalaryCalcType` — FIXED, PERCENT_OF_BASE
- `model SalaryComponent` — institutionId, name, type, calcType, value, isActive
- `model StaffSalaryComponent` — institutionId, staffId, componentId, overrideValue?; unique(staffId, componentId)
- `PayrollRecord.breakdown` — `Json?`
- `PayrollRecord.payslipNo` — `String? @unique`

## 10. Library

- `LibraryBook.category` — `String?`
- `LibraryBook.shelfLocation` — `String?`
- `model LibraryFineRule` — institutionId (unique), finePerDay, graceDays (default 0), maxFine?

## 11. Transport

- `model TransportStop` — institutionId, routeId, name, sequence, pickupTime?, dropTime?, lat?, lng?
- `TransportAssignment.stopId` — `String?` + relation to `TransportStop`
- `TransportRoute.stopPoints` — back-relation to `TransportStop[]` (named to avoid colliding with the existing free-text `stops` field)
- `TransportVehicle.lastLat` / `lastLng` / `lastLocationAt` — `Float?` / `Float?` / `DateTime?` (live-tracking readiness)

## 12. Inventory & assets

- `enum AssetStatus` — AVAILABLE, ALLOCATED, MAINTENANCE, RETIRED, LOST
- `model AssetCategory` — institutionId, name; unique(institutionId, name) — shared by `Asset` and `StockItem`
- `model Asset` — institutionId, categoryId?, name, code, serialNo?, purchaseDate?, purchaseCost?, vendor?, location?, status, condition?, notes?; unique(institutionId, code)
- `model AssetAllocation` — institutionId, assetId, allocatedToUserId?, allocatedToLocation?, allocatedAt, returnedAt?, note?
- `model AssetMaintenance` — institutionId, assetId, date, description, cost?, vendor?, status
- `model StockItem` — institutionId, name, sku?, unit, quantity (default 0), reorderLevel (default 0), categoryId?
- `enum StockMovementType` — IN, OUT, ADJUST
- `model StockMovement` — institutionId, stockItemId, type, quantity, unitCost?, reference?, note?, createdByUserId
- `model PurchaseRecord` — institutionId, vendor, invoiceNo?, date, totalAmount, items (Json), note?, createdByUserId

## 13. Admissions CRM

- `enum EnquiryStatus` — NEW, CONTACTED, VISITED, APPLIED, ENROLLED, LOST
- `model AdmissionEnquiry` — institutionId, studentName, guardianName?, phone, email?, classInterested?, source?, status, notes?, assignedToUserId?, followUpAt?, convertedStudentId?
- `Student.applicationStatus` — `String?`

## 14. Student profile extras

- `Student.previousSchool` / `previousClass` — `String?` / `String?`
- `Student.medicalNotes` — `String? @db.Text`
- `Student.allergies` — `String?`
- `Student.emergencyContactName` / `emergencyContactPhone` / `emergencyContactRelation` — `String?`
- `Student.customFields` — `Json?`
- `model CustomFieldDefinition` — institutionId, entity (default "STUDENT"), key, label, type, options?, required (default false), sortOrder (default 0); unique(institutionId, entity, key)

## 15. Communication

- `Notice.classId` / `sectionId` — `String?` + relations to `Class`/`Section`
- `Notice.scheduledAt` — `DateTime?`
- `enum CampaignChannel` — SMS, EMAIL, IN_APP
- `enum CampaignStatus` — DRAFT, SCHEDULED, SENDING, SENT, FAILED, CANCELLED
- `model MessageCampaign` — institutionId, channel, subject?, body (Text), audience (Json), status, scheduledAt?, sentAt?, recipientCount, successCount, failureCount, isDemo, createdByUserId
- `model MessageGroup` — institutionId, name, description?, createdByUserId
- `model MessageGroupMember` — groupId, userId; @@id(groupId, userId)
- `Message.groupId` — `String?` + relation to `MessageGroup`

## 16. Tasks & reviews for teachers

- `model TeacherTask` — institutionId, title, description?, dueDate?, status (default "OPEN"), assignedToUserId, createdByUserId
- `model PerformanceReview` — institutionId, studentId, reviewerUserId, period, ratings (Json), comments? (Text)

## 17. Exams

- `model ExamTimetableSlot` — institutionId, examId, className, sectionName?, subjectName, date, startTime, endTime, room?

## 18. SaaS layer

- `model FeatureFlag` — key (unique, global), description?, defaultEnabled
- `model PlanFeature` — planId, featureKey, enabled, limitValue?; unique(planId, featureKey)
- `model InstitutionFeatureOverride` — institutionId, featureKey, enabled, limitValue?; unique(institutionId, featureKey)
- `enum UsageMetric` — SMS, EMAIL, AI_CALL, STORAGE_MB
- `model UsageRecord` — institutionId, metric, quantity, costBdt?, meta?; index(institutionId, metric, createdAt)
- `model ApiKey` — institutionId, name, keyPrefix, keyHash (unique), scopes (String[]), lastUsedAt?, revokedAt?, createdByUserId
- `model WebhookEndpoint` — institutionId, url, events (String[]), secret, isActive
- `model WebhookDelivery` — webhookId, event, payload (Json), statusCode?, success, attempt
- `enum TicketStatus` — OPEN, IN_PROGRESS, RESOLVED, CLOSED
- `model SupportTicket` — institutionId, subject, description (Text), status, priority (default "NORMAL"), createdByUserId, assignedToUserId?
- `model SupportTicketMessage` — ticketId, authorUserId, body (Text)
- `model OnboardingProgress` — institutionId (unique), completedSteps (String[]), dismissed
- `model DataExportJob` — institutionId, requestedByUserId, status, fileUrl?, expiresAt?, completedAt?
- `model ChangelogEntry` — title, body (Text), version?, publishedAt, audience (default "ALL") — platform-global, not tenant-scoped

## 19. Sessions

- `RefreshToken.userAgent` / `ipAddress` / `lastUsedAt` — `String?` / `String?` / `DateTime?`
- `RefreshToken` new index: `@@index([expiresAt])`

## 20. AI

- `model AiInteraction` — institutionId, userId, feature, prompt? (Text), response? (Text), model?, inputTokens?, outputTokens?, isDemo, status; index(institutionId, feature, createdAt)
- `enum AiDraftStatus` — DRAFT, APPROVED, REJECTED, PUBLISHED
- `model AiDraft` — institutionId, feature, entityType?, entityId?, content (Text), status, createdByUserId, reviewedByUserId?, reviewedAt?
- `model KnowledgeDocument` — institutionId, title, content (Text), category?, isActive, createdByUserId

## 21. Report views

- `model SavedReportView` — institutionId, userId, name, reportKey, filters (Json), isShared
- `model ReportSchedule` — institutionId, savedViewId, cron, recipients (String[]), format, lastRunAt?, isActive, createdByUserId

## 22. Branch / User scoping

- `Branch.phone` / `email` — `String?` / `String?` (Branch already had `address` and `isActive`, so only these two were added)
- `User.branchId` — `String?` + relation to `Branch`

## 23. Performance indexes

- `Invoice`: `@@index([institutionId, status])`, `@@index([institutionId, dueDate])`
- `Message`: `@@index([institutionId, receiverId, read])`
- `Guardian`: `@@index([institutionId])`
- `Student`: `@@index([institutionId, classId, sectionId])`
- `AuditLog`: `@@index([institutionId, createdAt])`
- `TimetableSlot`: `@@index([teacherId])`
- `IdCard`: `@@index([templateId])`
- `SubjectOffering`: `@@index([subjectId])`
- `RefreshToken`: `@@index([expiresAt])`

## Verification performed

- `npx prisma format` — clean
- `npx prisma validate` — schema valid
- `npx prisma generate` — client generated successfully
- `npx tsc --noEmit -p .` — existing backend code compiles unchanged
- `npx prisma migrate diff --from-schema-datamodel <pre-Wave-C schema copy> --to-schema-datamodel prisma/schema.prisma --script` — produced the hand-saved `migration.sql` (47 new tables, 14 new enums, 118 new indexes, and only nullable/defaulted `ADD COLUMN`s on existing tables — no `DROP`/`ALTER COLUMN`/`RENAME` statements)

No commands were run against the database — this migration has not been
applied anywhere yet.
