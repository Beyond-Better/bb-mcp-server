/**
 * Core library type definitions for bb-mcp-server
 *
 * Defines internal types and interfaces used throughout the library.
 */

/**
 * Generic logger interface used throughout the library
 */
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
  dir?(arg: unknown): void;
  child?(context: Record<string, unknown>): Logger;
}

/**
 * Library configuration options
 */
export interface LibraryConfig {
  /**
   * Logger instance for the library to use
   */
  logger?: Logger;

  /**
   * Enable debug mode for additional logging
   */
  debug?: boolean;

  /**
   * Custom key prefixes for KV storage
   */
  keyPrefixes?: Record<string, readonly string[]>;
}

/**
 * Generic result wrapper for operations that may fail
 */
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

/**
 * Async result for operations that return promises
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Base interface for all library services
 */
export interface LibraryService {
  /**
   * Initialize the service
   */
  initialize(): Promise<void>;

  /**
   * Clean up and close the service
   */
  close(): Promise<void>;

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean;
}

/**
 * Event emitter interface for library components
 */
export interface EventEmitter<T extends Record<string, unknown[]> = Record<string, unknown[]>> {
  on<K extends keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void,
  ): void;
  off<K extends keyof T>(
    event: K,
    listener: (...args: T[K] extends unknown[] ? T[K] : never) => void,
  ): void;
  emit<K extends keyof T>(event: K, ...args: T[K] extends unknown[] ? T[K] : never): boolean;
}

/**
 * Generic pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount?: number;
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Generic filter options
 */
export interface FilterOptions {
  [key: string]: unknown;
}

/**
 * Sort options
 */
export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Library component status
 */
export enum ComponentStatus {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  component: string;
  message?: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Generic metrics interface
 */
export interface Metrics {
  [key: string]: number | string | boolean;
}

/**
 * Library version information
 */
export interface VersionInfo {
  version: string;
  buildDate?: string;
  gitCommit?: string;
}

/**
 * Generic callback function types
 */
export type Callback<T = void> = (error?: Error, result?: T) => void;
export type AsyncCallback<T = void> = (error?: Error, result?: T) => Promise<void>;

/**
 * Utility type for making all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Utility type for making specific keys required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Utility type for making specific keys optional
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Generic constructor type
 */
export type Constructor<T = {}> = new (...args: unknown[]) => T;

/**
 * Abstract constructor type
 */
export type AbstractConstructor<T = {}> = abstract new (...args: unknown[]) => T;
