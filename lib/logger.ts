/**
 * Club 19 Sales OS - Logging System
 *
 * Structured logging with environment-aware log levels
 *
 * Log Levels:
 * - debug: Development-only verbose logging
 * - info: General informational messages
 * - warn: Warning messages
 * - error: Error messages
 *
 * Production: Only info, warn, error
 * Development: All levels including debug
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  environment: "development" | "production";
  enableDebug: boolean;
  enableInfo: boolean;
  enableWarn: boolean;
  enableError: boolean;
}

// Determine environment
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  environment: IS_PRODUCTION ? "production" : "development",
  enableDebug: IS_DEVELOPMENT,
  enableInfo: true,
  enableWarn: true,
  enableError: true,
};

let loggerConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Configure logger settings
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  loggerConfig = { ...loggerConfig, ...config };
}

/**
 * Format timestamp for logs
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format log message with metadata
 */
function formatLogMessage(
  level: LogLevel,
  subsystem: string,
  message: string,
  data?: any
): string {
  const timestamp = getTimestamp();
  const levelTag = level.toUpperCase().padEnd(5);

  let formatted = `[${timestamp}] ${levelTag} [${subsystem}] ${message}`;

  if (data !== undefined) {
    // Format data for logging
    if (typeof data === "object") {
      try {
        formatted += ` ${JSON.stringify(data)}`;
      } catch (e) {
        formatted += ` [Circular or non-serializable data]`;
      }
    } else {
      formatted += ` ${data}`;
    }
  }

  return formatted;
}

/**
 * Debug log - development only
 */
export function debug(subsystem: string, message: string, data?: any): void {
  if (!loggerConfig.enableDebug) return;

  const formatted = formatLogMessage("debug", subsystem, message, data);
  console.debug(formatted);
}

/**
 * Info log - general informational messages
 */
export function info(subsystem: string, message: string, data?: any): void {
  if (!loggerConfig.enableInfo) return;

  const formatted = formatLogMessage("info", subsystem, message, data);
  console.log(formatted);
}

/**
 * Warning log - potential issues
 */
export function warn(subsystem: string, message: string, data?: any): void {
  if (!loggerConfig.enableWarn) return;

  const formatted = formatLogMessage("warn", subsystem, message, data);
  console.warn(formatted);
}

/**
 * Error log - error conditions
 */
export function error(subsystem: string, message: string, data?: any): void {
  if (!loggerConfig.enableError) return;

  const formatted = formatLogMessage("error", subsystem, message, data);
  console.error(formatted);
}

/**
 * Convenience method for timing operations
 */
export class Timer {
  private startTime: number;
  private subsystem: string;
  private operation: string;

  constructor(subsystem: string, operation: string) {
    this.subsystem = subsystem;
    this.operation = operation;
    this.startTime = Date.now();
    debug(subsystem, `⏱️ Starting: ${operation}`);
  }

  end(additionalInfo?: string): number {
    const duration = Date.now() - this.startTime;
    const message = additionalInfo
      ? `✓ Completed: ${this.operation} (${duration}ms) - ${additionalInfo}`
      : `✓ Completed: ${this.operation} (${duration}ms)`;

    info(this.subsystem, message);
    return duration;
  }

  endWithError(errorMessage: string): number {
    const duration = Date.now() - this.startTime;
    error(this.subsystem, `✗ Failed: ${this.operation} (${duration}ms) - ${errorMessage}`);
    return duration;
  }
}

/**
 * Create a subsystem-specific logger
 */
export function createLogger(subsystem: string) {
  return {
    debug: (message: string, data?: any) => debug(subsystem, message, data),
    info: (message: string, data?: any) => info(subsystem, message, data),
    warn: (message: string, data?: any) => warn(subsystem, message, data),
    error: (message: string, data?: any) => error(subsystem, message, data),
    timer: (operation: string) => new Timer(subsystem, operation),
  };
}

/**
 * Standard subsystem names for consistency
 */
export const SUBSYSTEMS = {
  XERO: "XERO",
  XERO_AUTH: "XERO AUTH",
  XERO_CONTACTS: "XERO CONTACTS",
  XERO_INVOICES: "XERO INVOICES",
  XERO_SYNC: "XERO SYNC",
  XERO_WEBHOOKS: "XERO WEBHOOKS",
  XATA: "XATA",
  XATA_SALES: "XATA SALES",
  VALIDATION: "VALIDATION",
  ECONOMICS: "ECONOMICS",
  SANITIZATION: "SANITIZE",
  RATE_LIMIT: "RATE LIMIT",
  ERROR_SYSTEM: "ERROR SYSTEM",
  COMMISSION: "COMMISSION",
  RBAC: "RBAC",
  AUTH: "AUTH",
  MIDDLEWARE: "MIDDLEWARE",
  API: "API",
  SEARCH: "SEARCH",
} as const;

/**
 * Default logger instance
 */
const logger = {
  debug,
  info,
  warn,
  error,
  createLogger,
  Timer,
  configureLogger,
  SUBSYSTEMS,
};

export default logger;
