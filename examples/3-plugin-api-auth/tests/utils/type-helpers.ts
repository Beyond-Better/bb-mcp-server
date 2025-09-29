/**
 * Type assertion helpers for tests
 *
 * These helpers provide type-safe access to workflow result data
 * while maintaining test readability and avoiding repetitive type assertions.
 */

/**
 * Type-safe access to workflow result data
 */
export function getResultData(result: any): any {
  return result.data as any;
}

/**
 * Type-safe access to workflow error
 */
export function getResultError(result: any): any {
  return result.error as any;
}

/**
 * Type-safe access to unknown error
 */
export function getUnknownError(error: unknown): any {
  return error as any;
}
