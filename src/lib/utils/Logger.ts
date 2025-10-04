/**
 * Logger - Generic logging system for bb-mcp-server library
 *
 * Provides structured logging with configurable levels and formats.
 */

import { blue, bold, cyan, green, red, yellow } from '@std/fmt/colors';
import { format } from '@std/datetime';

const logLevels = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = typeof logLevels[number];

const logFormats = ['text', 'json'] as const;
export type LogFormat = typeof logFormats[number];

export interface LoggerConfig {
  level?: LogLevel;
  format?: LogFormat;
  includeTimestamp?: boolean;
  includeSource?: boolean;
  colorize?: boolean;
}

/**
 * Generic logger implementation with configurable output and formatting
 */
export class Logger {
  private currentLogLevel: LogLevel;
  private config: Required<Omit<LoggerConfig, 'outputStream'>> & {
    level: LogLevel;
    format: LogFormat;
    includeTimestamp: boolean;
    includeSource: boolean;
    colorize: boolean;
  };

  constructor(config: LoggerConfig = {}) {
    this.currentLogLevel = config.level ?? this.getLogLevelFromEnv();
    this.config = {
      level: this.currentLogLevel,
      format: config.format ?? 'text',
      includeTimestamp: config.includeTimestamp ?? true,
      includeSource: config.includeSource ?? true,
      colorize: config.colorize ?? true,
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      this.writeLog('debug', message, data);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      this.writeLog('info', message, data);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      this.writeLog('warn', message, data);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, data?: unknown): void {
    if (this.shouldLog('error')) {
      const errorData = error
        ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          ...(typeof data === 'object' && data !== null ? data : {}),
        }
        : data;

      this.writeLog('error', message, errorData);
    }
  }

  /**
   * Log an object for debugging (similar to console.dir)
   * Uses stderr for consistency with other log methods
   */
  dir(arg: unknown): void {
    if (this.shouldLog('debug')) {
      if (this.config.format === 'json') {
        this.writeLog('debug', 'Debug object', arg);
      } else {
        // For text format, use stderr for consistency
        // Create a formatted debug message
        const timestamp = this.config.includeTimestamp
          ? `[${format(new Date(), 'dd-MM-yyyy hh:mm:ss.SSS')}] `
          : '';
        const colorizedDebug = this.config.colorize ? cyan('DEBUG') : 'DEBUG';
        console.error(`${timestamp}${colorizedDebug}: Debug object:`);
        console.error(JSON.stringify(arg, null, 2));
      }
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    return new ContextLogger(this, context);
  }

  /**
   * Update the log level
   */
  setLevel(level: LogLevel): void {
    this.currentLogLevel = level;
    this.config.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.currentLogLevel;
  }

  /**
   * Check if a message at the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return logLevels.indexOf(level) >= logLevels.indexOf(this.currentLogLevel);
  }

  /**
   * Write a log message with appropriate formatting
   * Uses stderr by default for MCP STDIO transport compatibility
   */
  private writeLog(level: LogLevel, message: string, data?: unknown): void {
    const logEntry = this.formatLogEntry(level, message, data);

    // Use console.error for thread-safe stderr output (MCP compatible)
    // This avoids WritableStream locking issues with concurrent log calls
    console.error(logEntry);
  }

  /**
   * Format a log entry based on the configured format
   */
  private formatLogEntry(level: LogLevel, message: string, data?: unknown): string {
    if (this.config.format === 'json') {
      return this.formatJsonEntry(level, message, data);
    } else {
      return this.formatTextEntry(level, message, data);
    }
  }

  /**
   * Format a log entry as JSON
   */
  private formatJsonEntry(level: LogLevel, message: string, data?: unknown): string {
    const entry: Record<string, unknown> = {
      level,
      message,
    };

    if (this.config.includeTimestamp) {
      entry.timestamp = new Date().toISOString();
    }

    if (data !== undefined) {
      entry.data = data;
    }

    return JSON.stringify(entry);
  }

  /**
   * Format a log entry as human-readable text
   */
  private formatTextEntry(level: LogLevel, message: string, data?: unknown): string {
    let formattedMessage = message;

    if (this.config.colorize) {
      formattedMessage = this.colorMessage(message, level);
    }

    let logString = '';

    if (this.config.includeTimestamp) {
      const timestamp = format(new Date(), 'dd-MM-yyyy hh:mm:ss.SSS');
      logString += `[${timestamp}] `;
    }

    // Extract source if message follows pattern: "Source: rest of message"
    if (this.config.includeSource) {
      const sourceMatch = message.match(/^([^\s:]+):\s*(.*)/);
      if (sourceMatch) {
        const [, source, actualMessage] = sourceMatch;
        const coloredSource = this.config.colorize ? bold(blue(source ?? '')) : (source ?? '');
        const coloredActualMessage = this.config.colorize
          ? this.colorMessage(actualMessage ?? '', level)
          : (actualMessage ?? '');
        formattedMessage = `${coloredSource}: ${coloredActualMessage}`;
      }
    }

    logString += formattedMessage;

    // Append data if provided
    if (data !== undefined) {
      if (this.config.colorize) {
        logString += ` ${cyan(JSON.stringify(data, null, 2))}`;
      } else {
        logString += ` ${JSON.stringify(data)}`;
      }
    }

    return logString;
  }

  /**
   * Apply color to a message based on log level
   */
  private colorMessage(message: string, level: LogLevel): string {
    switch (level) {
      case 'error':
        return red(message);
      case 'warn':
        return yellow(message);
      case 'debug':
        return cyan(message);
      case 'info':
      default:
        return green(message);
    }
  }

  /**
   * Get log level from environment variable
   */
  private getLogLevelFromEnv(): LogLevel {
    const envLogLevel = Deno.env.get('LOG_LEVEL')?.toLowerCase();
    if (envLogLevel && logLevels.includes(envLogLevel as LogLevel)) {
      return envLogLevel as LogLevel;
    }
    return 'info';
  }
}

/**
 * Logger with additional context information
 */
class ContextLogger extends Logger {
  constructor(private parentLogger: Logger, private context: Record<string, unknown>) {
    super();
  }

  override debug(message: string, data?: unknown): void {
    const combinedData = {
      ...this.context,
      ...(typeof data === 'object' && data !== null ? data : {}),
    };
    this.parentLogger.debug(message, combinedData);
  }

  override info(message: string, data?: unknown): void {
    const combinedData = {
      ...this.context,
      ...(typeof data === 'object' && data !== null ? data : {}),
    };
    this.parentLogger.info(message, combinedData);
  }

  override warn(message: string, data?: unknown): void {
    const combinedData = {
      ...this.context,
      ...(typeof data === 'object' && data !== null ? data : {}),
    };
    this.parentLogger.warn(message, combinedData);
  }

  override error(message: string, error?: Error, data?: unknown): void {
    const combinedData = {
      ...this.context,
      ...(typeof data === 'object' && data !== null ? data : {}),
    };
    this.parentLogger.error(message, error, combinedData);
  }

  override dir(arg: unknown): void {
    this.parentLogger.dir({ ...this.context, value: arg });
  }
}

/**
 * Create a default logger instance for convenience
 */
export const createLogger = (config?: LoggerConfig): Logger => {
  return new Logger(config);
};

/**
 * Default logger instance
 */
export const logger = createLogger();
