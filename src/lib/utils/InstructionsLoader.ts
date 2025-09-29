/**
 * Instructions Loader Utility
 *
 * Provides flexible loading of instructions content with fallback strategies
 * for both development and production environments. Supports multiple input
 * sources with proper priority and fallback handling.
 */

import type { Logger } from './Logger.ts';
import { toError } from './Error.ts';
import { DEFAULT_INSTRUCTIONS } from '../instructions.ts';

export interface InstructionsLoaderOptions {
  /**
   * Logger instance for debug and error reporting
   */
  logger: Logger;

  /**
   * Direct instructions string from configuration
   * Corresponds to MCP_SERVER_INSTRUCTIONS environment variable
   */
  instructionsConfig?: string;

  /**
   * File path to load instructions from
   * Corresponds to MCP_INSTRUCTIONS_FILE environment variable
   */
  instructionsFilePath?: string;

  /**
   * Default file name to check for in the project root
   * Defaults to 'mcp_server_instructions.md'
   */
  defaultFileName?: string;

  /**
   * Base path for resolving relative file paths
   * Defaults to current working directory
   */
  basePath?: string;
}

/**
 * Load instructions content using configurable path strategy with fallbacks
 */
export async function loadInstructions(options: InstructionsLoaderOptions): Promise<string> {
  const {
    logger,
    instructionsConfig,
    instructionsFilePath,
    defaultFileName = 'mcp_server_instructions.md',
    basePath = Deno.cwd(),
  } = options;

  // Strategy 1: Use direct config string (highest priority)
  if (instructionsConfig && instructionsConfig.trim()) {
    logger.debug('InstructionsLoader: Using instructions from configuration variable');
    return instructionsConfig.trim();
  }

  // Strategy 2: Load from configured file path
  if (instructionsFilePath) {
    try {
      logger.debug(
        `InstructionsLoader: Loading from configured file path: ${instructionsFilePath}`,
      );

      // Resolve path relative to base path if not absolute
      const resolvedPath = instructionsFilePath.startsWith('/')
        ? instructionsFilePath
        : `${basePath}/${instructionsFilePath}`;

      const content = await Deno.readTextFile(resolvedPath);
      if (content.trim()) {
        logger.info(
          'InstructionsLoader: Successfully loaded instructions from configured file path',
          {
            path: resolvedPath,
            contentLength: content.length,
          },
        );
        return content.trim();
      } else {
        logger.warn(`InstructionsLoader: File at ${resolvedPath} is empty, trying next strategy`);
      }
    } catch (error) {
      logger.warn(
        `InstructionsLoader: Failed to load from configured path ${instructionsFilePath}:`,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: instructionsFilePath,
        },
      );
      // Fall through to next strategy
    }
  }

  // Strategy 3: Load from default file in base path
  try {
    const defaultPath = `${basePath}/${defaultFileName}`;
    logger.debug(`InstructionsLoader: Attempting to load from default path: ${defaultPath}`);

    const content = await Deno.readTextFile(defaultPath);
    if (content.trim()) {
      logger.info('InstructionsLoader: Successfully loaded instructions from default file', {
        path: defaultPath,
        contentLength: content.length,
      });
      return content.trim();
    } else {
      logger.warn(`InstructionsLoader: Default file at ${defaultPath} is empty, using fallback`);
    }
  } catch (error) {
    logger.debug('InstructionsLoader: Failed to load from default path', {
      error: error instanceof Error ? error.message : 'Unknown error',
      defaultPath: `${basePath}/${defaultFileName}`,
    });
    // Fall through to fallback strategy
  }

  // Strategy 4: Use embedded fallback instructions
  if (DEFAULT_INSTRUCTIONS && DEFAULT_INSTRUCTIONS.trim()) {
    logger.info('InstructionsLoader: Using embedded fallback instructions');
    return DEFAULT_INSTRUCTIONS.trim();
  }

  // Final fallback - this should never happen with proper DEFAULT_INSTRUCTIONS
  const fallback =
    'MCP Server - Instructions could not be loaded from any source. Server functionality may be limited.';
  logger.error(
    'InstructionsLoader: All instruction loading strategies failed, using minimal fallback',
    toError('All instruction loading strategies failed, using minimal fallback'),
    {
      message: 'All instruction loading strategies failed',
      strategiesTried: ['config', 'filePath', 'defaultFile', 'embedded'],
      fallbackUsed: true,
    },
  );

  return fallback;
}

/**
 * Validate that instructions were loaded successfully
 * Checks for minimum content requirements
 */
export function validateInstructions(instructions: string, logger?: Logger): boolean {
  const isValid = instructions.length > 100 &&
    (instructions.includes('MCP Server') || instructions.includes('workflow'));

  if (logger) {
    if (isValid) {
      logger.debug('InstructionsLoader: Instructions validation passed', {
        contentLength: instructions.length,
        hasWorkflowContent: instructions.includes('workflow'),
        hasMCPContent: instructions.includes('MCP Server'),
      });
    } else {
      logger.warn('InstructionsLoader: Instructions validation failed', {
        contentLength: instructions.length,
        hasWorkflowContent: instructions.includes('workflow'),
        hasMCPContent: instructions.includes('MCP Server'),
        minLengthMet: instructions.length > 100,
      });
    }
  }

  return isValid;
}

export interface InstructionsLoadingSummary {
  hasConfigString: boolean;
  hasFilePath: boolean;
  defaultFileName: string;
  basePath: string;
  hasEmbeddedFallback: boolean;
  strategies: string[];
}

/**
 * Get a summary of instruction loading options for debugging
 */
export function getInstructionsLoadingSummary(
  options: InstructionsLoaderOptions,
): InstructionsLoadingSummary {
  return {
    hasConfigString: !!(options.instructionsConfig && options.instructionsConfig.trim()),
    hasFilePath: !!options.instructionsFilePath,
    defaultFileName: options.defaultFileName || 'mcp_server_instructions.md',
    basePath: options.basePath || Deno.cwd(),
    hasEmbeddedFallback: !!(DEFAULT_INSTRUCTIONS && DEFAULT_INSTRUCTIONS.trim()),
    strategies: ['config', 'filePath', 'defaultFile', 'embedded', 'minimalFallback'],
  };
}
