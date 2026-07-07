import { createLogger, format, transports } from 'winston';
import { env } from '../config/env';

// =============================================================================
// Winston Logger — Pretty in dev, JSON in prod
// =============================================================================

const { combine, timestamp, printf, colorize, errors, json } = format;

// Pretty format for development
const prettyFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `[${ts}] ${level}: ${message}${metaStr}${stackStr}`;
  }),
);

// JSON format for production
const jsonFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = createLogger({
  level: env.LOG_LEVEL,
  format: env.LOG_FORMAT === 'pretty' ? prettyFormat : jsonFormat,
  transports: [
    new transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

export default logger;
