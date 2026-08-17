import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env';
import { globalErrorHandler } from './middleware/error.middleware';

// Routes
import authRouter from './modules/auth/auth.routes';
import studentRouter from './modules/students/student.routes';
import guardianRouter from './modules/guardians/guardian.routes';
import feeRouter from './modules/fees/fee.routes';
import userRouter from './modules/users/user.routes';
import attendanceRouter from './modules/attendance/attendance.routes';
import resultsRouter from './modules/results/results.routes';
import timetablesRouter from './modules/timetables/timetables.routes';
import noticesRouter from './modules/notices/notices.routes';
import libraryRouter from './modules/library/library.routes';
import lectureRouter from './modules/lectures/lecture.routes';
import transportRouter from './modules/transport/transport.routes';
import hrRouter from './modules/hr/hr.routes';
import aiRouter from './modules/ai/ai.routes';
import institutionRouter from './modules/institution/institution.routes';
import institutionApplicationRouter from './modules/institution-application/institution-application.routes';
import messagesRouter from './modules/messages/messages.routes';
import reportsRouter from './modules/reports/reports.routes';
import curriculumRouter from './modules/curriculum/curriculum.routes';
import idCardRouter from './modules/idcards/idcard.routes';
import idCardPublicRouter from './modules/idcards/idcard.public.routes';

const app = express();

// Apply security headers with relaxed cross-origin policies for frontend integration
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer-when-downgrade' },
  })
);

// Explicit allow-list only — no wildcard domain suffix matching. Any additional
// origin (e.g. a Vercel preview URL) must be added via ALLOWED_ORIGINS, not inferred.
const allowedOrigins = [
  env.FRONTEND_URL,
  'https://peopleitsms.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  ...(env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Log requests
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Global rate limiting — skipped in the automated test environment, where a
// single authorization-matrix test run legitimately fires far more than
// 100 requests/minute against one process; the limiter itself is exercised
// by real traffic, not by this suite.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests from this IP, please try again after a minute' },
  skip: () => env.NODE_ENV === 'test',
});
app.use('/api/', globalLimiter);

import { enforceReadOnly } from './middleware/readonly.middleware';

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'development' ? 100 : 10, // Increased for dev testing
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes' },
  skip: () => env.NODE_ENV === 'test',
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/refresh', authLimiter);

// Strict rate limit for the public, unauthenticated institute application form
const applicationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'development' ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many applications submitted from this IP, please try again later' },
  skip: () => env.NODE_ENV === 'test',
});
app.use('/api/v1/institution-applications/apply', applicationLimiter);

// Enforce read-only mode for active support access sessions
app.use('/api/', enforceReadOnly);

// Mount API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/students', studentRouter);
app.use('/api/v1/guardians', guardianRouter);
app.use('/api/v1/fees', feeRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/results', resultsRouter);
app.use('/api/v1/timetables', timetablesRouter);
app.use('/api/v1/notices', noticesRouter);
app.use('/api/v1/library', libraryRouter);
app.use('/api/v1/lectures', lectureRouter);
app.use('/api/v1/transport', transportRouter);
app.use('/api/v1/hr', hrRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/institution', institutionRouter);
app.use('/api/v1/institution-applications', institutionApplicationRouter);
app.use('/api/v1/messages', messagesRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/curriculum', curriculumRouter);
// Public verification route mounted BEFORE the authenticated id-cards router
// so an unauthenticated QR-code scan of /verify/:token never hits the
// authenticate/setTenant middleware chain the main router applies below.
app.use('/api/v1/id-cards', idCardPublicRouter);
app.use('/api/v1/id-cards', idCardRouter);

// Base route health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware (must be registered last)
app.use(globalErrorHandler);

export default app;
export { app };
// reload trigger
