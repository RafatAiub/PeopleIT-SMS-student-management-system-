@echo off
REM Local development backend on the Docker database, never production.
REM Usage:  scripts\dev-local.cmd [database]      (default database: sms_redesign)
REM
REM SKIP_DOTENV=true makes the backend ignore backend\.env (which points at
REM PRODUCTION), so only the values below are used. Email, SMS, payment
REM gateways and AI providers have no keys here, so they all run in demo mode.

set DB=%1
if "%DB%"=="" set DB=sms_redesign

set SKIP_DOTENV=true
set NODE_ENV=development
set PORT=3001
set APP_URL=http://localhost:3001
set FRONTEND_URL=http://localhost:5173
set DATABASE_URL=postgresql://sms_user:sms_pass@localhost:5433/%DB%
set REDIS_URL=redis://:sms_redis_pass@localhost:6379
set JWT_ACCESS_SECRET=local-dev-access-secret-not-for-production-0001
set JWT_REFRESH_SECRET=local-dev-refresh-secret-not-for-production-0002
set BACKGROUND_JOBS=false
set EMAIL_ENABLED=false
set SMS_ENABLED=false
set FEE_DEMO_PAYMENTS_ENABLED=true
set SSLCOMMERZ_ENABLED=false
set BKASH_ENABLED=false
set NAGAD_ENABLED=false

echo Starting backend on database %DB% (API only; email, SMS, payments and AI in demo mode)...
cd /d "%~dp0..\backend"
npm run dev
