import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${rid}: ${message}${extra}`;
  }),
);

function createLogger() {
  const isTest = process.env.NODE_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';

  const transports: winston.transport[] = [];

  if (!isTest) {
    transports.push(
      new winston.transports.Console({
        format: isProd ? logFormat : consoleFormat,
      }),
    );
  }

  if (isProd || process.env.LOG_TO_FILE === 'true') {
    transports.push(
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: 'app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat,
      }),
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        level: 'error',
        format: logFormat,
      }),
    );
  }

  // Ensure at least one transport
  if (transports.length === 0) {
    transports.push(
      new winston.transports.Console({
        silent: true,
      }),
    );
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    defaultMeta: { service: 'landjet-growth-engine' },
    transports,
  });
}

export const logger = createLogger();

export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}
