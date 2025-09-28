/**
 * Tests for Logger class
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { Logger, type LogLevel } from '../../../src/lib/utils/Logger.ts';

// Test utilities - Mock console.error to capture log output
class ConsoleErrorCapture {
  private chunks: string[] = [];
  private originalConsoleError: typeof console.error;

  constructor() {
    this.originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      // Convert args to string like console.error would
      const message = args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(
        ' ',
      );
      this.chunks.push(message);
    };
  }

  getOutput(): string[] {
    return [...this.chunks];
  }

  clear(): void {
    this.chunks = [];
  }

  restore(): void {
    console.error = this.originalConsoleError;
  }
}

function createTestLogger(config: {
  level?: LogLevel;
  format?: 'text' | 'json';
  colorize?: boolean;
  includeTimestamp?: boolean;
  includeSource?: boolean;
} = {}): { logger: Logger; output: ConsoleErrorCapture } {
  const output = new ConsoleErrorCapture();
  const logger = new Logger(config);
  return { logger, output };
}

Deno.test('Logger - basic logging functionality', () => {
  const { logger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    logger.info('Test message');

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'info');
    assertEquals(logEntry.message, 'Test message');
    assertExists(logEntry.timestamp);
  } finally {
    output.restore();
  }
});

Deno.test('Logger - log levels filtering', () => {
  const { logger, output } = createTestLogger({ level: 'warn', format: 'json' });

  try {
    // These should not log
    logger.debug('Debug message');
    logger.info('Info message');

    // These should log
    logger.warn('Warning message');
    logger.error('Error message');

    const logs = output.getOutput();
    assertEquals(logs.length, 2);

    const warnLog = JSON.parse(logs[0]!);
    const errorLog = JSON.parse(logs[1]!);

    assertEquals(warnLog.level, 'warn');
    assertEquals(warnLog.message, 'Warning message');
    assertEquals(errorLog.level, 'error');
    assertEquals(errorLog.message, 'Error message');
  } finally {
    output.restore();
  }
});

Deno.test('Logger - JSON format with data', () => {
  const { logger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    const testData = { userId: '123', action: 'test' };
    logger.info('Test message', testData);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'info');
    assertEquals(logEntry.message, 'Test message');
    assertEquals(logEntry.data, testData);
  } finally {
    output.restore();
  }
});

Deno.test('Logger - text format basic', () => {
  const { logger, output } = createTestLogger({
    format: 'text',
    colorize: false,
    includeTimestamp: false,
    includeSource: false,
  });

  try {
    logger.info('Test message');

    const logs = output.getOutput();
    assertEquals(logs.length, 1);
    assertEquals(logs[0]!.trim(), 'Test message');
  } finally {
    output.restore();
  }
});

Deno.test('Logger - text format with data', () => {
  const { logger, output } = createTestLogger({
    format: 'text',
    colorize: false,
    includeTimestamp: false,
    includeSource: false,
  });

  try {
    const testData = { key: 'value' };
    logger.info('Test message', testData);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logLine = logs[0]!.trim();
    assert(logLine.includes('Test message'));
    assert(logLine.includes('{"key":"value"}'));
  } finally {
    output.restore();
  }
});

Deno.test('Logger - error logging with Error object', () => {
  const { logger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    const testError = new Error('Test error');
    const additionalData = { context: 'test' };

    logger.error('An error occurred', testError, additionalData);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'error');
    assertEquals(logEntry.message, 'An error occurred');

    // Check error object structure
    assertExists(logEntry.data.error);
    assertEquals(logEntry.data.error.name, 'Error');
    assertEquals(logEntry.data.error.message, 'Test error');
    assertExists(logEntry.data.error.stack);

    // Check additional data merged
    assertEquals(logEntry.data.context, 'test');
  } finally {
    output.restore();
  }
});

Deno.test('Logger - error logging without Error object', () => {
  const { logger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    const testData = { context: 'test' };
    logger.error('An error occurred', undefined, testData);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'error');
    assertEquals(logEntry.message, 'An error occurred');
    assertEquals(logEntry.data, testData);
  } finally {
    output.restore();
  }
});

Deno.test('Logger - source extraction in text format', () => {
  const { logger, output } = createTestLogger({
    format: 'text',
    colorize: false,
    includeTimestamp: false,
    includeSource: true,
  });

  try {
    logger.info('MyModule: This is a test message');

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logLine = logs[0]!.trim();
    // Should extract "MyModule" as source and format it specially
    assert(logLine.includes('MyModule'));
    assert(logLine.includes('This is a test message'));
  } finally {
    output.restore();
  }
});

Deno.test('Logger - timestamp inclusion/exclusion', () => {
  // Test with timestamp
  const { logger: loggerWithTimestamp, output: outputWithTimestamp } = createTestLogger({
    format: 'text',
    colorize: false,
    includeTimestamp: true,
    includeSource: false,
  });

  try {
    loggerWithTimestamp.info('Test message');

    const logsWithTimestamp = outputWithTimestamp.getOutput();
    assertEquals(logsWithTimestamp.length, 1);
    // Should include timestamp pattern like [dd-MM-yyyy hh:mm:ss.SSS]
    assert(/\[\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}\.\d{3}\]/.test(logsWithTimestamp[0]!));
  } finally {
    outputWithTimestamp.restore();
  }

  // Test without timestamp
  const { logger: loggerWithoutTimestamp, output: outputWithoutTimestamp } = createTestLogger({
    format: 'text',
    colorize: false,
    includeTimestamp: false,
    includeSource: false,
  });

  try {
    loggerWithoutTimestamp.info('Test message');

    const logsWithoutTimestamp = outputWithoutTimestamp.getOutput();
    assertEquals(logsWithoutTimestamp.length, 1);
    // Should not include timestamp pattern
    assert(!/\[\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}\.\d{3}\]/.test(logsWithoutTimestamp[0]!));
  } finally {
    outputWithoutTimestamp.restore();
  }
});

Deno.test('Logger - log level management', () => {
  const { logger, output } = createTestLogger({ level: 'info' });

  try {
    // Initial level
    assertEquals(logger.getLevel(), 'info');

    // Change level
    logger.setLevel('error');
    assertEquals(logger.getLevel(), 'error');

    // Test that lower levels don't log
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    const logs = output.getOutput();
    assertEquals(logs.length, 1); // Only error should log
  } finally {
    output.restore();
  }
});

Deno.test('Logger - dir method JSON format', () => {
  const { logger, output } = createTestLogger({
    level: 'debug',
    format: 'json',
    colorize: false,
  });

  try {
    const testObject = { nested: { data: 'value' }, array: [1, 2, 3] };
    logger.dir(testObject);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'debug');
    assertEquals(logEntry.message, 'Debug object');
    assertEquals(logEntry.data, testObject);
  } finally {
    output.restore();
  }
});

Deno.test('Logger - dir method text format', () => {
  const { logger, output } = createTestLogger({
    level: 'debug',
    format: 'text',
    colorize: false,
    includeTimestamp: false,
  });

  try {
    const testObject = { nested: { data: 'value' }, array: [1, 2, 3] };
    logger.dir(testObject);

    const logs = output.getOutput();
    assertEquals(logs.length, 2); // One for debug message, one for object

    // Should have debug prefix and object data
    assert(logs[0]!.includes('DEBUG'));
    assert(logs[1]!.includes('nested'));
  } finally {
    output.restore();
  }
});

Deno.test('Logger - child logger functionality', () => {
  const { logger: parentLogger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    const context = { userId: '123', requestId: 'req-456' };
    const childLogger = parentLogger.child(context);

    childLogger.info('Child logger message', { additional: 'data' });

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'info');
    assertEquals(logEntry.message, 'Child logger message');

    // Should include both context and additional data
    assertEquals(logEntry.data.userId, '123');
    assertEquals(logEntry.data.requestId, 'req-456');
    assertEquals(logEntry.data.additional, 'data');
  } finally {
    output.restore();
  }
});

Deno.test('Logger - child logger with various data types', () => {
  const { logger: parentLogger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    const context = { service: 'test' };
    const childLogger = parentLogger.child(context);

    // Test with null data
    childLogger.info('Message with null', null);

    // Test with undefined data
    childLogger.info('Message with undefined', undefined);

    // Test with string data
    childLogger.info('Message with string', 'string data');

    // Test with number data
    childLogger.info('Message with number', 42);

    const logs = output.getOutput();
    assertEquals(logs.length, 4);

    // Check each log has the context
    for (const log of logs) {
      const logEntry = JSON.parse(log);
      assertEquals(logEntry.data.service, 'test');
    }
  } finally {
    output.restore();
  }
});

Deno.test('Logger - child logger dir method', () => {
  const { logger: parentLogger, output } = createTestLogger({
    level: 'debug',
    format: 'json',
    colorize: false,
  });

  try {
    const context = { component: 'test' };
    const childLogger = parentLogger.child(context);

    const testObject = { data: 'value' };
    childLogger.dir(testObject);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'debug');
    assertEquals(logEntry.message, 'Debug object');
    assertEquals(logEntry.data.component, 'test');
    assertEquals(logEntry.data.value, testObject);
  } finally {
    output.restore();
  }
});

Deno.test('Logger - child logger error handling', () => {
  const { logger: parentLogger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    const context = { service: 'test' };
    const childLogger = parentLogger.child(context);

    const error = new Error('Test error');
    const additionalData = { operation: 'test_op' };

    childLogger.error('Error occurred', error, additionalData);

    const logs = output.getOutput();
    assertEquals(logs.length, 1);

    const logEntry = JSON.parse(logs[0]!);
    assertEquals(logEntry.level, 'error');
    assertEquals(logEntry.message, 'Error occurred');

    // Should have context, error, and additional data
    assertEquals(logEntry.data.service, 'test');
    assertEquals(logEntry.data.operation, 'test_op');
    assertExists(logEntry.data.error);
    assertEquals(logEntry.data.error.message, 'Test error');
  } finally {
    output.restore();
  }
});

Deno.test('Logger - edge cases and error handling', () => {
  const { logger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    // Test with empty message
    logger.info('');

    // Test with very long message
    const longMessage = 'A'.repeat(1000);
    logger.info(longMessage);

    // Test with special characters
    logger.info('Message with \n newlines \t tabs and " quotes');

    // Test with circular reference (should not crash)
    const circular: any = { name: 'test' };
    circular.self = circular;

    // This might throw or handle gracefully - we just want it not to crash the logger
    try {
      logger.info('Circular reference test', circular);
    } catch {
      // It's ok if JSON.stringify fails, logger should handle it gracefully
    }

    const logs = output.getOutput();
    // Should have at least 3 logs (empty, long, special chars)
    assert(logs.length >= 3);
  } finally {
    output.restore();
  }
});

// Test concurrency safety - this is the key test for our fix
Deno.test('Logger - concurrent logging safety', async () => {
  const { logger, output } = createTestLogger({ format: 'json', colorize: false });

  try {
    // Simulate concurrent logging scenarios that would cause the original bug
    const promises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() => {
        logger.info(`Concurrent message ${i}`, { index: i });
      }));

    // All promises should resolve without "stream already locked" errors
    await Promise.all(promises);

    const logs = output.getOutput();
    assertEquals(logs.length, 100);

    // Verify all logs are valid JSON and contain expected data
    for (let i = 0; i < 100; i++) {
      const logEntry = JSON.parse(logs[i]!);
      assertEquals(logEntry.level, 'info');
      assert(logEntry.message.includes('Concurrent message'));
      assert(typeof logEntry.data.index === 'number');
    }
  } finally {
    output.restore();
  }
});
