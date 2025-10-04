/**
 * Authentication Configuration for MCP Server
 *
 * 🔒 SECURITY-CRITICAL: Provides configuration for OAuth-based authentication
 * with support for optional OAuth provider and consumer dependencies.
 *
 * Based on MCP specification requirements and legacy authentication patterns.
 */

import type { Logger } from '../../types/library.types.ts';
import type { OAuthProvider } from '../auth/OAuthProvider.ts';
import type { OAuthConsumer } from '../auth/OAuthConsumer.ts';

/**
 * Authentication configuration options
 */
export interface AuthenticationConfig {
  /** Enable authentication for MCP requests */
  enabled: boolean;

  /** Skip authentication even if OAuth components are available */
  skipAuthentication?: boolean;

  /** Require authentication for all MCP endpoints (default: true) */
  requireAuthentication?: boolean;

  /** Transport-specific authentication settings */
  transport?: {
    /** HTTP transport authentication (per MCP spec: SHOULD use OAuth) */
    http?: {
      enabled?: boolean;
      skipAuthentication?: boolean;
      requireAuthentication?: boolean;
    };

    /** STDIO transport authentication (per MCP spec: SHOULD NOT use OAuth) */
    stdio?: {
      enabled?: boolean;
      allowOAuth?: boolean; // Allow OAuth despite spec discouragement
      skipAuthentication?: boolean;
    };
  };

  /** Session binding configuration for third-party OAuth */
  sessionBinding?: {
    /** Enable session binding between MCP and third-party tokens */
    enabled?: boolean;

    /** Enable automatic third-party token refresh */
    enableAutoRefresh?: boolean;

    /** Third-party token validation timeout (ms) */
    validationTimeoutMs?: number;
  };

  /** Error handling configuration */
  errorHandling?: {
    /** Include detailed error messages in responses */
    includeDetails?: boolean;

    /** Include client guidance in error responses */
    includeGuidance?: boolean;

    /** Use custom error headers (X-MCP-Error-Code, etc.) */
    useCustomHeaders?: boolean;
  };
}

/**
 * Authentication dependencies configuration
 */
export interface AuthenticationDependencies {
  /** OAuth provider for MCP token validation (optional) */
  oauthProvider?: OAuthProvider;

  /** OAuth consumer for third-party authentication (optional) */
  oauthConsumer?: OAuthConsumer;

  /** Third-party API client for token refresh (optional) */
  thirdPartyApiClient?: any;

  /** Logger for security event logging */
  logger?: Logger;
}

/**
 * Transport-specific authentication configuration
 */
export interface TransportAuthenticationConfig {
  /** Transport type */
  transport: 'http' | 'stdio';

  /** Resolved authentication settings for this transport */
  enabled: boolean;
  skipAuthentication: boolean;
  requireAuthentication: boolean;

  /** Session binding settings */
  sessionBinding: {
    enabled: boolean;
    enableAutoRefresh: boolean;
    validationTimeoutMs: number;
  };

  /** Error handling settings */
  errorHandling: {
    includeDetails: boolean;
    includeGuidance: boolean;
    useCustomHeaders: boolean;
  };
}

/**
 * Default authentication configuration values
 */
export const DEFAULT_AUTH_CONFIG: Required<AuthenticationConfig> = {
  enabled: false, // Will be auto-enabled if oauthProvider is available
  skipAuthentication: false,
  requireAuthentication: true,

  transport: {
    http: {
      enabled: true, // Per MCP spec: HTTP SHOULD use OAuth
      skipAuthentication: false,
      requireAuthentication: true,
    },
    stdio: {
      enabled: false, // Per MCP spec: STDIO SHOULD NOT use OAuth
      allowOAuth: true, // But allow if explicitly configured (spec says SHOULD NOT, not MUST NOT)
      skipAuthentication: false,
    },
  },

  sessionBinding: {
    enabled: true, // Enable if both oauthProvider and oauthConsumer available
    enableAutoRefresh: true,
    validationTimeoutMs: 5000, // 5 seconds
  },

  errorHandling: {
    includeDetails: true,
    includeGuidance: true,
    useCustomHeaders: false, // Follow MCP spec, avoid non-standard headers
  },
};

/**
 * Authentication configuration resolver
 *
 * Resolves authentication configuration based on available dependencies,
 * transport type, and MCP specification requirements.
 */
export class AuthenticationConfigResolver {
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Resolve authentication configuration for a specific transport
   */
  resolveForTransport(
    transportType: 'http' | 'stdio',
    config: AuthenticationConfig,
    dependencies: AuthenticationDependencies,
  ): TransportAuthenticationConfig {
    // Start with defaults
    const resolved: TransportAuthenticationConfig = {
      transport: transportType,
      enabled: false,
      skipAuthentication: false,
      requireAuthentication: true,
      sessionBinding: {
        enabled: false,
        enableAutoRefresh: true,
        validationTimeoutMs: 5000,
      },
      errorHandling: {
        includeDetails: true,
        includeGuidance: true,
        useCustomHeaders: false,
      },
    };

    // Apply base configuration
    resolved.enabled = config.enabled;
    resolved.skipAuthentication = config.skipAuthentication ?? false;
    resolved.requireAuthentication = config.requireAuthentication ?? true;

    // Apply transport-specific overrides
    const transportConfig = config.transport?.[transportType];
    if (transportConfig) {
      if (transportConfig.enabled !== undefined) {
        resolved.enabled = transportConfig.enabled;
      }
      if (transportConfig.skipAuthentication !== undefined) {
        resolved.skipAuthentication = transportConfig.skipAuthentication;
      }
      // Only HTTP transport has requireAuthentication property
      if (
        transportType === 'http' && 'requireAuthentication' in transportConfig &&
        transportConfig.requireAuthentication !== undefined
      ) {
        resolved.requireAuthentication = transportConfig.requireAuthentication;
      }
    }

    // Auto-enable authentication if OAuth provider is available
    if (!resolved.enabled && dependencies.oauthProvider) {
      resolved.enabled = true;
      this.logger?.info(
        'AuthenticationConfigResolver: Auto-enabled authentication (OAuth provider available)',
        {
          transport: transportType,
        },
      );
    }

    // Apply MCP specification recommendations
    if (transportType === 'stdio') {
      // MCP spec: STDIO transports SHOULD NOT use OAuth
      if (resolved.enabled && !config.transport?.stdio?.allowOAuth) {
        this.logger?.warn(
          'AuthenticationConfigResolver: OAuth enabled for STDIO transport (discouraged by MCP spec)',
          {
            transport: transportType,
            recommendation: 'Use environment-based credentials for STDIO transports',
          },
        );
      }
    } else if (transportType === 'http') {
      // MCP spec: HTTP transports SHOULD use OAuth
      if (!resolved.enabled && dependencies.oauthProvider) {
        this.logger?.warn(
          'AuthenticationConfigResolver: OAuth disabled for HTTP transport (recommended by MCP spec)',
          {
            transport: transportType,
            recommendation: 'Enable OAuth for HTTP transports per MCP specification',
          },
        );
      }
    }

    // Session binding configuration
    if (config.sessionBinding) {
      resolved.sessionBinding.enabled = config.sessionBinding.enabled ??
        (!!dependencies.oauthProvider && !!dependencies.oauthConsumer);
      resolved.sessionBinding.enableAutoRefresh = config.sessionBinding.enableAutoRefresh ?? true;

      // Handle validationTimeoutMs with proper undefined handling
      const timeoutMs = config.sessionBinding.validationTimeoutMs;
      resolved.sessionBinding.validationTimeoutMs = timeoutMs !== undefined ? timeoutMs : 5000;
    } else {
      // Auto-enable session binding if both OAuth components available
      resolved.sessionBinding.enabled = !!dependencies.oauthProvider &&
        !!dependencies.oauthConsumer;
    }

    // Error handling configuration
    if (config.errorHandling) {
      resolved.errorHandling.includeDetails = config.errorHandling.includeDetails ?? true;
      resolved.errorHandling.includeGuidance = config.errorHandling.includeGuidance ?? true;
      resolved.errorHandling.useCustomHeaders = config.errorHandling.useCustomHeaders ?? false;
    }

    // Disable authentication if explicitly skipped
    if (resolved.skipAuthentication) {
      resolved.enabled = false;
      this.logger?.info('AuthenticationConfigResolver: Authentication explicitly disabled', {
        transport: transportType,
        skipAuthentication: true,
      });
    }

    // Log final configuration
    this.logger?.debug('AuthenticationConfigResolver: Resolved configuration', {
      transport: transportType,
      enabled: resolved.enabled,
      skipAuthentication: resolved.skipAuthentication,
      requireAuthentication: resolved.requireAuthentication,
      sessionBinding: resolved.sessionBinding,
      errorHandling: resolved.errorHandling,
      hasOAuthProvider: !!dependencies.oauthProvider,
      hasOAuthConsumer: !!dependencies.oauthConsumer,
      hasThirdPartyApiClient: !!dependencies.thirdPartyApiClient,
    });

    return resolved;
  }

  /**
   * Validate authentication configuration
   */
  validateConfig(
    config: AuthenticationConfig,
    dependencies: AuthenticationDependencies,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required dependencies when authentication is enabled
    if (config.enabled && !config.skipAuthentication) {
      if (!dependencies.oauthProvider) {
        errors.push('OAuth provider required when authentication is enabled');
      }
    }

    // Check session binding dependencies
    if (config.sessionBinding?.enabled) {
      if (!dependencies.oauthProvider) {
        errors.push('OAuth provider required for session binding');
      }
      if (!dependencies.oauthConsumer) {
        errors.push('OAuth consumer required for session binding');
      }
      if (config.sessionBinding.enableAutoRefresh && !dependencies.thirdPartyApiClient) {
        errors.push('Third-party API client required for automatic token refresh');
      }
    }

    // Validate timeout values
    if (
      config.sessionBinding?.validationTimeoutMs && config.sessionBinding.validationTimeoutMs < 1000
    ) {
      errors.push('Session binding validation timeout must be at least 1000ms');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create authentication configuration from environment variables
   */
  static fromEnvironment(logger?: Logger): AuthenticationConfig {
    const config: AuthenticationConfig = {
      enabled: process.env.MCP_AUTH_ENABLED === 'true',
      skipAuthentication: process.env.MCP_AUTH_SKIP === 'true',
      requireAuthentication: process.env.MCP_AUTH_REQUIRE !== 'false', // Default to true
    };

    // Transport-specific settings
    if (process.env.MCP_AUTH_HTTP_ENABLED !== undefined) {
      config.transport = {
        ...config.transport,
        http: {
          enabled: process.env.MCP_AUTH_HTTP_ENABLED === 'true',
          skipAuthentication: process.env.MCP_AUTH_HTTP_SKIP === 'true',
          requireAuthentication: process.env.MCP_AUTH_HTTP_REQUIRE !== 'false',
        },
      };
    }

    if (process.env.MCP_AUTH_STDIO_ENABLED !== undefined) {
      config.transport = {
        ...config.transport,
        stdio: {
          enabled: process.env.MCP_AUTH_STDIO_ENABLED === 'true',
          allowOAuth: process.env.MCP_AUTH_STDIO_ALLOW_OAUTH === 'true',
          skipAuthentication: process.env.MCP_AUTH_STDIO_SKIP === 'true',
        },
      };
    }

    // Session binding settings
    if (process.env.MCP_SESSION_BINDING_ENABLED !== undefined) {
      const timeoutMs = process.env.MCP_SESSION_BINDING_TIMEOUT_MS
        ? parseInt(process.env.MCP_SESSION_BINDING_TIMEOUT_MS)
        : undefined;

      config.sessionBinding = {
        enabled: process.env.MCP_SESSION_BINDING_ENABLED === 'true',
        enableAutoRefresh: process.env.MCP_SESSION_BINDING_AUTO_REFRESH !== 'false',
        ...(timeoutMs !== undefined && { validationTimeoutMs: timeoutMs }),
      };
    }

    // Error handling settings
    if (process.env.MCP_AUTH_ERROR_DETAILS !== undefined) {
      config.errorHandling = {
        includeDetails: process.env.MCP_AUTH_ERROR_DETAILS === 'true',
        includeGuidance: process.env.MCP_AUTH_ERROR_GUIDANCE !== 'false',
        useCustomHeaders: process.env.MCP_AUTH_CUSTOM_HEADERS === 'true',
      };
    }

    logger?.info('AuthenticationConfigResolver: Loaded configuration from environment', {
      enabled: config.enabled,
      skipAuthentication: config.skipAuthentication,
      requireAuthentication: config.requireAuthentication,
    });

    return config;
  }
}
