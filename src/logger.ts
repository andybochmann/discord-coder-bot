import winston from "winston";
import { config } from "./config.js";

/**
 * Application-wide logger instance configured with winston.
 * Provides structured logging with timestamps and log levels.
 *
 * @example
 * import { logger } from './logger.js';
 * logger.info('Bot started', { userId: '123' });
 * logger.error('Failed to process message', { error: err.message });
 */
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "discord-coder-bot" },
  transports: [
    // Console transport with colorized output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : "";
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

/**
 * Creates a child logger with additional context.
 *
 * @param context - Additional context to include in all log messages
 * @returns A child logger instance with the specified context
 *
 * @example
 * const sessionLogger = createChildLogger({ sessionId: 'abc123' });
 * sessionLogger.info('Processing request'); // Includes sessionId in metadata
 */
export function createChildLogger(
  context: Record<string, unknown>
): winston.Logger {
  return logger.child(context);
}
