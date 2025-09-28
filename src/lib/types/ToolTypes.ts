/**
 * Tool Types - Re-export from ToolBase class
 *
 * The ToolBase interface has been replaced with an abstract ToolBase class.
 * This file now re-exports the class and related types for backward compatibility.
 */

// Re-export the ToolBase class and related types
export {
  ToolBase,
  type ToolContext,
  //type ToolRegistration,
  type ToolResult,
} from '../tools/ToolBase.ts';

// // Legacy export for backward compatibility
// // If any code still references ToolBase as a type, this provides compatibility
// export type { ToolBase as IToolBase } from '../tools/ToolBase.ts';
