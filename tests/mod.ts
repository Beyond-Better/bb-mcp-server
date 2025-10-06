/**
 * @fileoverview Test utilities and mock classes for testing applications using this package.
 *
 * This module provides comprehensive testing helpers including:
 * - Mock implementations of core classes
 * - Test data generators and fixtures
 * - Assertion helpers and custom matchers
 * - Environment setup and teardown utilities
 *
 * @example
 * ```typescript
 * import { createMockLogger, createMockConfigManager } from "@beyondbetter/bb-mcp-server/testing";
 *
 * // Get configManager with defaults
 * const configManager = createMockConfigManager();
 *
 * // Create mock data
 * const mockLogger = createMockLogger();
 *
 * ```
 *
 * @module testing
 */

// Re-export all test utilities
export * from './utils/test-helpers.ts';
export * from './utils/tool-test-helpers.ts';
