-- =============================================================================
-- Auth upgrade: phone as a login identifier, email verification, 2FA
-- =============================================================================
-- Order matters here. Phone values are normalised and de-duplicated BEFORE the
-- unique index is created, otherwise the index build aborts on the first
-- collision and leaves the migration half-applied.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED');
CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL', 'TOTP');
CREATE TYPE "VerificationPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN_2FA', 'PHONE_VERIFICATION');

-- ── New User columns ─────────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt"     TIMESTAMP(3),
  ADD COLUMN "phoneVerifiedAt"     TIMESTAMP(3),
  ADD COLUMN "twoFactorEnabled"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorMethod"     "TwoFactorMethod",
  ADD COLUMN "twoFactorSecret"     TEXT,
  ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "status"              "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- ── Grandfather every existing account ───────────────────────────────────────
-- Agreed explicitly: verification applies only to accounts created from here
-- on. Back-dating to createdAt rather than now() keeps the audit trail honest
-- about the fact that these were never actually challenged.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

-- ── Normalise existing phone numbers to 8801XXXXXXXXX ────────────────────────
-- Mirrors normalizeBdMobile() in src/utils/phone.ts. Values that are not valid
-- BD mobile numbers are deliberately left untouched rather than deleted: they
-- simply never match a login attempt (which is always normalised first), so
-- keeping them loses no data and costs nothing.
--
-- The character class is spelled [^0-9] rather than \D on purpose. \D was
-- verified against this database and strips nothing — '+8801700000000' came
-- back unchanged — which would have made this whole UPDATE a silent no-op and
-- left the unique index below to fail on the first collision.
UPDATE "User"
SET "phone" = CASE
    WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^01[0-9]{9}$'
      THEN '88' || regexp_replace("phone", '[^0-9]', '', 'g')
    WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^8801[0-9]{9}$'
      THEN regexp_replace("phone", '[^0-9]', '', 'g')
    ELSE "phone"
  END
WHERE "phone" IS NOT NULL;

-- ── Resolve duplicates before the unique index ───────────────────────────────
-- A shared number cannot identify one account. The earliest-created row keeps
-- the number; later rows have it cleared, and those users re-add (and, once
-- phone OTP ships, verify) their own number. Email sign-in is unaffected.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "phone" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "User"
  WHERE "phone" IS NOT NULL AND "phone" <> ''
)
UPDATE "User" u
SET "phone" = NULL
FROM ranked r
WHERE u."id" = r."id" AND r.rn > 1;

-- Empty strings would collide with each other under a unique index.
UPDATE "User" SET "phone" = NULL WHERE "phone" = '';

-- ── Indexes on User ──────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE INDEX "User_phone_idx" ON "User"("phone");
CREATE INDEX "User_status_idx" ON "User"("status");

-- ── VerificationToken ────────────────────────────────────────────────────────
CREATE TABLE "VerificationToken" (
  "id"         TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "purpose"    "VerificationPurpose" NOT NULL,
  "userId"     TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE INDEX "VerificationToken_userId_purpose_idx" ON "VerificationToken"("userId", "purpose");
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");
ALTER TABLE "VerificationToken"
  ADD CONSTRAINT "VerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── OtpCode ──────────────────────────────────────────────────────────────────
CREATE TABLE "OtpCode" (
  "id"         TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "purpose"    "OtpPurpose" NOT NULL,
  "userId"     TEXT NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpCode_userId_purpose_idx" ON "OtpCode"("userId", "purpose");
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");
ALTER TABLE "OtpCode"
  ADD CONSTRAINT "OtpCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── BackupCode ───────────────────────────────────────────────────────────────
CREATE TABLE "BackupCode" (
  "id"       TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "usedAt"   TIMESTAMP(3),
  CONSTRAINT "BackupCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BackupCode_userId_idx" ON "BackupCode"("userId");
ALTER TABLE "BackupCode"
  ADD CONSTRAINT "BackupCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
