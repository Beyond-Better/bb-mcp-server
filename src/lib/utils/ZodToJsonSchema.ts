/**
 * Zod to JSON Schema Converter
 *
 * Converts Zod schemas to JSON Schema format for API documentation and tool descriptions.
 * This is essential for the get_schema_for_workflow tool to provide usable parameter schemas.
 */

import { z, type ZodSchema, type ZodType } from 'zod';

/**
 * JSON Schema representation
 */
export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: (string | number | boolean)[];
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  nullable?: boolean;
}

/**
 * Convert Zod schema to JSON Schema format
 */
export class ZodToJsonSchema {
  /**
   * Convert a Zod schema to JSON Schema
   */
  static convert(schema: ZodSchema): JsonSchema {
    return ZodToJsonSchema.convertZodType(schema._def);
  }

  /**
   * Convert Zod type definition to JSON Schema
   */
  private static convertZodType(def: any): JsonSchema {
    const typeName = (def as any).typeName;

    switch (typeName) {
      case 'ZodString':
        return ZodToJsonSchema.convertString(def);

      case 'ZodNumber':
        return ZodToJsonSchema.convertNumber(def);

      case 'ZodBoolean':
        return { type: 'boolean' };

      case 'ZodArray':
        return ZodToJsonSchema.convertArray(def);

      case 'ZodObject':
        return ZodToJsonSchema.convertObject(def);

      case 'ZodEnum':
        return ZodToJsonSchema.convertEnum(def);

      case 'ZodOptional':
        return ZodToJsonSchema.convertZodType(def.innerType._def);

      case 'ZodDefault':
        const baseSchema = ZodToJsonSchema.convertZodType(def.innerType._def);
        baseSchema.default = def.defaultValue();
        return baseSchema;

      case 'ZodUnion':
        return ZodToJsonSchema.convertUnion(def);

      case 'ZodLiteral':
        return ZodToJsonSchema.convertLiteral(def);

      case 'ZodRecord':
        return ZodToJsonSchema.convertRecord(def);

      case 'ZodAny':
        return {};

      case 'ZodUnknown':
        return {};

      case 'ZodNever':
        return { not: {} };

      case 'ZodNull':
        return { type: 'null' };

      case 'ZodUndefined':
        return { type: 'undefined' };

      default:
        console.warn(`ZodToJsonSchema: Unsupported Zod type: ${typeName}`);
        return { description: `Unsupported Zod type: ${typeName}` };
    }
  }

  /**
   * Convert ZodString to JSON Schema
   */
  private static convertString(def: any): JsonSchema {
    const schema: JsonSchema = { type: 'string' };

    // Add length constraints
    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            schema.minLength = check.value;
            break;
          case 'max':
            schema.maxLength = check.value;
            break;
          case 'email':
            schema.format = 'email';
            break;
          case 'url':
            schema.format = 'uri';
            break;
          case 'uuid':
            schema.format = 'uuid';
            break;
        }
      }
    }

    return schema;
  }

  /**
   * Convert ZodNumber to JSON Schema
   */
  private static convertNumber(def: any): JsonSchema {
    const schema: JsonSchema = { type: 'number' };

    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            schema.minimum = check.value;
            break;
          case 'max':
            schema.maximum = check.value;
            break;
          case 'int':
            schema.type = 'integer';
            break;
        }
      }
    }

    return schema;
  }

  /**
   * Convert ZodArray to JSON Schema
   */
  private static convertArray(def: any): JsonSchema {
    const itemsSchema = ZodToJsonSchema.convertZodType(def.type._def);
    const schema: JsonSchema = {
      type: 'array',
      items: itemsSchema,
    };

    if (def.minLength !== null) {
      schema.minLength = def.minLength.value;
    }
    if (def.maxLength !== null) {
      schema.maxLength = def.maxLength.value;
    }

    return schema;
  }

  /**
   * Convert ZodObject to JSON Schema
   */
  private static convertObject(def: any): JsonSchema {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    // Process shape properties
    for (const [key, value] of Object.entries(def.shape())) {
      const zodType = value as ZodType;
      properties[key] = ZodToJsonSchema.convertZodType(zodType._def);

      // Check if field is required (not optional)
      if (!ZodToJsonSchema.isOptional(zodType)) {
        required.push(key);
      }

      // Extract description from Zod description
      const description = ZodToJsonSchema.getDescription(zodType);
      if (description) {
        properties[key].description = description;
      }
    }

    const schema: JsonSchema = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      schema.required = required;
    }

    // Handle unknown keys policy
    if (def.unknownKeys === 'passthrough') {
      schema.additionalProperties = true;
    } else if (def.unknownKeys === 'strip') {
      schema.additionalProperties = false;
    }

    return schema;
  }

  /**
   * Convert ZodEnum to JSON Schema
   */
  private static convertEnum(def: any): JsonSchema {
    return {
      type: 'string',
      enum: def.values,
    };
  }

  /**
   * Convert ZodUnion to JSON Schema
   */
  private static convertUnion(def: any): JsonSchema {
    const schemas = def.options.map((option: ZodType) =>
      ZodToJsonSchema.convertZodType(option._def)
    );

    return {
      anyOf: schemas,
    };
  }

  /**
   * Convert ZodLiteral to JSON Schema
   */
  private static convertLiteral(def: any): JsonSchema {
    const value = def.value;

    return {
      type: typeof value as string,
      enum: [value],
    };
  }

  /**
   * Convert ZodRecord to JSON Schema
   */
  private static convertRecord(def: any): JsonSchema {
    const valueSchema = def.valueType ? ZodToJsonSchema.convertZodType(def.valueType._def) : {};

    return {
      type: 'object',
      additionalProperties: valueSchema,
    };
  }

  /**
   * Check if a Zod type is optional
   */
  private static isOptional(zodType: ZodType): boolean {
    // Check if it's wrapped in ZodOptional or has a default
    const def = zodType._def as any;
    return def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault';
  }

  /**
   * Extract description from Zod type
   */
  private static getDescription(zodType: ZodType): string | undefined {
    // Try to get description from the schema
    try {
      const description = (zodType as any).description;
      return typeof description === 'string' ? description : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Convert with enhanced error handling
   */
  static safeConvert(schema: ZodSchema): JsonSchema | { error: string } {
    try {
      return ZodToJsonSchema.convert(schema);
    } catch (error) {
      return {
        error: `Failed to convert Zod schema: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Convert with fallback to basic object description
   */
  static convertWithFallback(schema: ZodSchema, fallbackDescription?: string): JsonSchema {
    const result = ZodToJsonSchema.safeConvert(schema);

    if ('error' in result) {
      console.warn('ZodToJsonSchema conversion failed:', result.error);
      return {
        type: 'object',
        description: fallbackDescription || 'Complex parameter schema (conversion failed)',
        additionalProperties: true,
      };
    }

    return result;
  }
}
