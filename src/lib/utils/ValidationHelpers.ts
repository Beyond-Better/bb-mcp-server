/**
 * Validation Helpers - Generic validation utilities for MCP servers
 *
 * Provides JSON schema validation, input sanitization, and common validation
 * patterns.
 */

import type { Logger } from './Logger.ts';
import { toError } from './Error.ts';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: unknown[];
  min?: number;
  max?: number;
  customValidator?: (value: unknown) => boolean | string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

/**
 * Generic validation utilities for MCP server applications
 */
export class ValidationHelpers {
  private static logger?: Logger;

  /**
   * Set logger instance for validation error reporting
   */
  static setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Validate object against JSON schema
   */
  static validateSchema(
    data: unknown,
    schema: Record<string, unknown>,
    path = '',
  ): ValidationResult {
    try {
      const errors = this.validateValue(data, schema, path);
      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger?.error('ValidationHelpers: Schema validation error', toError(error));
      return {
        isValid: false,
        errors: [{
          field: path || 'root',
          message: 'Schema validation failed',
          code: 'SCHEMA_ERROR',
          value: data,
        }],
      };
    }
  }

  /**
   * Validate individual value
   */
  private static validateValue(
    value: unknown,
    schema: Record<string, unknown>,
    path: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const type = schema.type as string;

    // Handle null/undefined
    if (value === null || value === undefined) {
      const required = schema.required as boolean || false;
      if (required) {
        errors.push({
          field: path,
          message: 'Field is required',
          code: 'REQUIRED',
        });
      }
      return errors;
    }

    // Type validation
    if (type && !this.validateType(value, type)) {
      errors.push({
        field: path,
        message: `Expected type ${type}, got ${typeof value}`,
        code: 'INVALID_TYPE',
        value,
      });
      return errors;
    }

    // String validation
    if (type === 'string' && typeof value === 'string') {
      errors.push(...this.validateString(value, schema, path));
    }

    // Number validation
    if ((type === 'number' || type === 'integer') && typeof value === 'number') {
      errors.push(...this.validateNumber(value, schema, path));
    }

    // Array validation
    if (type === 'array' && Array.isArray(value)) {
      errors.push(...this.validateArray(value, schema, path));
    }

    // Object validation
    if (type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      errors.push(...this.validateObject(value as Record<string, unknown>, schema, path));
    }

    // Enum validation
    if (schema.enum && Array.isArray(schema.enum)) {
      if (!schema.enum.includes(value)) {
        errors.push({
          field: path,
          message: `Value must be one of: ${schema.enum.join(', ')}`,
          code: 'INVALID_ENUM',
          value,
        });
      }
    }

    return errors;
  }

  /**
   * Validate type matches
   */
  private static validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Validate string constraints
   */
  private static validateString(
    value: string,
    schema: Record<string, unknown>,
    path: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Length validation
    if (schema.minLength && value.length < (schema.minLength as number)) {
      errors.push({
        field: path,
        message: `Minimum length is ${schema.minLength}`,
        code: 'MIN_LENGTH',
        value,
      });
    }

    if (schema.maxLength && value.length > (schema.maxLength as number)) {
      errors.push({
        field: path,
        message: `Maximum length is ${schema.maxLength}`,
        code: 'MAX_LENGTH',
        value,
      });
    }

    // Pattern validation
    if (schema.pattern) {
      const pattern = new RegExp(schema.pattern as string);
      if (!pattern.test(value)) {
        errors.push({
          field: path,
          message: 'Value does not match required pattern',
          code: 'INVALID_PATTERN',
          value,
        });
      }
    }

    // Format validation
    if (schema.format) {
      const formatError = this.validateFormat(value, schema.format as string, path);
      if (formatError) {
        errors.push(formatError);
      }
    }

    return errors;
  }

  /**
   * Validate number constraints
   */
  private static validateNumber(
    value: number,
    schema: Record<string, unknown>,
    path: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (schema.minimum && value < (schema.minimum as number)) {
      errors.push({
        field: path,
        message: `Minimum value is ${schema.minimum}`,
        code: 'MIN_VALUE',
        value,
      });
    }

    if (schema.maximum && value > (schema.maximum as number)) {
      errors.push({
        field: path,
        message: `Maximum value is ${schema.maximum}`,
        code: 'MAX_VALUE',
        value,
      });
    }

    return errors;
  }

  /**
   * Validate array constraints
   */
  private static validateArray(
    value: unknown[],
    schema: Record<string, unknown>,
    path: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Length validation
    if (schema.minItems && value.length < (schema.minItems as number)) {
      errors.push({
        field: path,
        message: `Minimum items is ${schema.minItems}`,
        code: 'MIN_ITEMS',
        value,
      });
    }

    if (schema.maxItems && value.length > (schema.maxItems as number)) {
      errors.push({
        field: path,
        message: `Maximum items is ${schema.maxItems}`,
        code: 'MAX_ITEMS',
        value,
      });
    }

    // Item validation
    if (schema.items) {
      const itemSchema = schema.items as Record<string, unknown>;
      for (let i = 0; i < value.length; i++) {
        const itemErrors = this.validateValue(value[i], itemSchema, `${path}[${i}]`);
        errors.push(...itemErrors);
      }
    }

    return errors;
  }

  /**
   * Validate object properties
   */
  private static validateObject(
    value: Record<string, unknown>,
    schema: Record<string, unknown>,
    path: string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const properties = schema.properties as Record<string, Record<string, unknown>> || {};
    const required = (schema.required as string[]) || [];

    // Check required properties
    for (const requiredProp of required) {
      if (!(requiredProp in value)) {
        errors.push({
          field: path ? `${path}.${requiredProp}` : requiredProp,
          message: 'Required property is missing',
          code: 'REQUIRED',
        });
      }
    }

    // Validate present properties
    for (const [prop, propValue] of Object.entries(value)) {
      const propSchema = properties[prop];
      if (propSchema) {
        const propPath = path ? `${path}.${prop}` : prop;
        const propErrors = this.validateValue(propValue, propSchema, propPath);
        errors.push(...propErrors);
      } else if (!schema.additionalProperties) {
        errors.push({
          field: path ? `${path}.${prop}` : prop,
          message: 'Additional property not allowed',
          code: 'ADDITIONAL_PROPERTY',
          value: propValue,
        });
      }
    }

    return errors;
  }

  /**
   * Validate string format (email, uri, etc.)
   */
  private static validateFormat(
    value: string,
    format: string,
    path: string,
  ): ValidationError | null {
    switch (format) {
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return {
            field: path,
            message: 'Invalid email format',
            code: 'INVALID_EMAIL',
            value,
          };
        }
        break;
      }

      case 'uri':
      case 'url': {
        try {
          new URL(value);
        } catch {
          return {
            field: path,
            message: 'Invalid URI/URL format',
            code: 'INVALID_URI',
            value,
          };
        }
        break;
      }

      case 'date': {
        if (isNaN(Date.parse(value))) {
          return {
            field: path,
            message: 'Invalid date format',
            code: 'INVALID_DATE',
            value,
          };
        }
        break;
      }

      case 'uuid': {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          return {
            field: path,
            message: 'Invalid UUID format',
            code: 'INVALID_UUID',
            value,
          };
        }
        break;
      }

      case 'hostname': {
        const hostnameRegex =
          /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!hostnameRegex.test(value)) {
          return {
            field: path,
            message: 'Invalid hostname format',
            code: 'INVALID_HOSTNAME',
            value,
          };
        }
        break;
      }

      case 'ipv4': {
        const ipv4Regex =
          /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipv4Regex.test(value)) {
          return {
            field: path,
            message: 'Invalid IPv4 address format',
            code: 'INVALID_IPV4',
            value,
          };
        }
        break;
      }

      default:
        // Unknown format - skip validation
        break;
    }

    return null;
  }

  /**
   * Validate with custom options (simplified interface)
   */
  static validateWithOptions(
    value: unknown,
    options: ValidationOptions,
    fieldName = 'value',
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Required validation
    if (options.required && (value === null || value === undefined || value === '')) {
      errors.push({
        field: fieldName,
        message: 'Field is required',
        code: 'REQUIRED',
        value,
      });
      return { isValid: false, errors };
    }

    // Skip further validation if value is empty and not required
    if (value === null || value === undefined || value === '') {
      return { isValid: true, errors: [] };
    }

    // String validations
    if (typeof value === 'string') {
      if (options.minLength && value.length < options.minLength) {
        errors.push({
          field: fieldName,
          message: `Minimum length is ${options.minLength}`,
          code: 'MIN_LENGTH',
          value,
        });
      }

      if (options.maxLength && value.length > options.maxLength) {
        errors.push({
          field: fieldName,
          message: `Maximum length is ${options.maxLength}`,
          code: 'MAX_LENGTH',
          value,
        });
      }

      if (options.pattern && !options.pattern.test(value)) {
        errors.push({
          field: fieldName,
          message: 'Value does not match required pattern',
          code: 'INVALID_PATTERN',
          value,
        });
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (options.min !== undefined && value < options.min) {
        errors.push({
          field: fieldName,
          message: `Minimum value is ${options.min}`,
          code: 'MIN_VALUE',
          value,
        });
      }

      if (options.max !== undefined && value > options.max) {
        errors.push({
          field: fieldName,
          message: `Maximum value is ${options.max}`,
          code: 'MAX_VALUE',
          value,
        });
      }
    }

    // Enum validation
    if (options.enum && !options.enum.includes(value)) {
      errors.push({
        field: fieldName,
        message: `Value must be one of: ${options.enum.join(', ')}`,
        code: 'INVALID_ENUM',
        value,
      });
    }

    // Custom validation
    if (options.customValidator) {
      const customResult = options.customValidator(value);
      if (customResult !== true) {
        errors.push({
          field: fieldName,
          message: typeof customResult === 'string' ? customResult : 'Custom validation failed',
          code: 'CUSTOM_VALIDATION',
          value,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: unknown): string {
    if (typeof input !== 'string') {
      return String(input || '');
    }

    // Remove null bytes and control characters except tabs, newlines, carriage returns
    return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  }

  /**
   * Sanitize HTML input (basic)
   */
  static sanitizeHtml(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Deep clone object for safe validation
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item)) as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * Format validation errors for display
   */
  static formatValidationErrors(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return 'No validation errors';
    }

    return errors
      .map((error) => `${error.field}: ${error.message}`)
      .join('; ');
  }

  /**
   * Check if a string is a valid identifier (variable name, etc.)
   */
  static isValidIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(identifier);
  }

  /**
   * Validate JSON string
   */
  static isValidJson(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a validation result from multiple validation results
   */
  static combineValidationResults(results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap((result) => result.errors);
    const allWarnings = results.flatMap((result) => result.warnings || []);

    const result: ValidationResult = {
      isValid: allErrors.length === 0,
      errors: allErrors,
    };

    if (allWarnings.length > 0) {
      result.warnings = allWarnings;
    }

    return result;
  }
}
