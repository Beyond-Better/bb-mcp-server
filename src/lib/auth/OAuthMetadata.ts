/**
 * OAuth Metadata - Authorization Server Metadata (RFC 8414)
 *
 * 🔒 SECURITY-CRITICAL: This component generates OAuth 2.0 Authorization Server
 * Metadata per RFC 8414. The metadata endpoint provides clients with information
 * about the authorization server's capabilities, endpoints, and supported features.
 *
 * Security Requirements:
 * - RFC 8414 full compliance for authorization server metadata
 * - Accurate capability advertisement (grant types, response types, etc.)
 * - Proper endpoint URL generation
 * - PKCE methods advertisement for security
 * - MCP-specific extensions for server identification
 */

import type { Logger } from '../../types/library.types.ts';
import { toError } from '../utils/Error.ts';
import type { AuthorizationServerMetadata, OAuthProviderConfig } from './OAuthTypes.ts';

/**
 * OAuth metadata configuration
 */
export interface OAuthMetadataConfig {
  /** OAuth issuer identifier (base URL) */
  issuer: string;
  /** Authorization endpoint path (default: /authorize) */
  authorizationEndpoint?: string;
  /** Token endpoint path (default: /token) */
  tokenEndpoint?: string;
  /** Client registration endpoint path (default: /register) */
  registrationEndpoint?: string;
  /** Token revocation endpoint path (optional) */
  revocationEndpoint?: string;
  /** Well-known metadata endpoint path (default: /.well-known/oauth-authorization-server) */
  metadataEndpoint?: string;
  /** Supported grant types */
  supportedGrantTypes: string[];
  /** Supported response types */
  supportedResponseTypes: string[];
  /** Supported scopes */
  supportedScopes: string[];
  /** Enable PKCE support */
  enablePKCE: boolean;
  /** Enable dynamic client registration */
  enableDynamicRegistration: boolean;

  // High Priority Optional Fields
  /** URL to human-readable API documentation */
  serviceDocumentation?: string;
  /** Supported UI locales for internationalization */
  uiLocalesSupported?: string[];

  /** MCP server extensions */
  mcpExtensions?: {
    serverName: string;
    serverVersion: string;
    supportedWorkflows: string[];
    mcpEndpoint?: string;
    callbackUrl?: string;
    upstreamProvider?: string;
    description?: string;
    documentationUrl?: string;
  };
}

/**
 * 🔒 SECURITY-CRITICAL: OAuth 2.0 Authorization Server Metadata Generator
 *
 * Implements RFC 8414 OAuth 2.0 Authorization Server Metadata specification.
 * Provides clients with standardized information about the authorization server's
 * capabilities, endpoints, and supported features.
 *
 * Key Security Features:
 * - RFC 8414 compliant metadata generation
 * - Accurate capability advertisement to prevent client misconfigurations
 * - Proper endpoint URL generation for security
 * - PKCE methods advertisement for public client security
 * - Configurable feature advertisement based on server capabilities
 */
export class OAuthMetadata {
  private config: OAuthMetadataConfig;
  private logger: Logger | undefined;

  constructor(config: OAuthMetadataConfig, logger?: Logger) {
    // Apply config with proper defaults
    this.config = config;
    this.logger = logger;

    this.logger?.info('OAuthMetadata: Initialized', {
      issuer: this.config.issuer,
      enablePKCE: this.config.enablePKCE,
      enableDynamicRegistration: this.config.enableDynamicRegistration,
      supportedGrantTypes: this.config.supportedGrantTypes.length,
      supportedScopes: this.config.supportedScopes.length,
    });
  }

  /**
   * 🔒 SECURITY-CRITICAL: Generate OAuth 2.0 Authorization Server Metadata
   *
   * Generates RFC 8414 compliant authorization server metadata that accurately
   * represents the server's capabilities and endpoints. This metadata is used
   * by OAuth clients for automatic configuration and capability discovery.
   */
  generateMetadata(): AuthorizationServerMetadata {
    const metadataId = Math.random().toString(36).substring(2, 15);

    //this.logger?.info(`OAuthMetadata: Generating authorization server metadata [${metadataId}]`, {
    //  metadataId,
    //  issuer: this.config.issuer,
    //  enableDynamicRegistration: this.config.enableDynamicRegistration,
    //  registrationEndpoint: this.config.registrationEndpoint,
    //  willIncludeInMetadata: !!this.config.enableDynamicRegistration,
    //});

    try {
      // 🔒 SECURITY-CRITICAL: RFC 8414 compliant metadata structure
      const metadata: AuthorizationServerMetadata = {
        // Required fields (RFC 8414)
        issuer: this.config.issuer,
        authorization_endpoint: this.buildEndpointUrl(this.config.authorizationEndpoint!),
        token_endpoint: this.buildEndpointUrl(this.config.tokenEndpoint!),

        // Optional endpoints
        ...(this.config.enableDynamicRegistration && {
          registration_endpoint: this.buildEndpointUrl(this.config.registrationEndpoint!),
        }),
        // Always include revocation endpoint
        revocation_endpoint: this.buildEndpointUrl(this.config.revocationEndpoint!),

        // Supported capabilities
        grant_types_supported: [...this.config.supportedGrantTypes],
        response_types_supported: [...this.config.supportedResponseTypes],
        scopes_supported: [...this.config.supportedScopes],

        // Token endpoint authentication methods
        token_endpoint_auth_methods_supported: this.getTokenEndpointAuthMethods(),

        // PKCE support (RFC 7636)
        code_challenge_methods_supported: this.getCodeChallengeMethods(),

        // High Priority Optional Fields
        // Service documentation for API consumers (RFC 8414 optional)
        ...(this.config.serviceDocumentation && {
          service_documentation: this.config.serviceDocumentation,
        }),
        // UI locales for internationalization (RFC 8414 optional)
        ...(this.config.uiLocalesSupported && {
          ui_locales_supported: [...this.config.uiLocalesSupported],
        }),
        // Revocation endpoint auth methods (RFC 7009)
        // Automatically included when revocation endpoint exists
        revocation_endpoint_auth_methods_supported: this.getTokenEndpointAuthMethods(),
      };

      this.logger?.debug(`OAuthMetadata: Registration endpoint decision [${metadataId}]`, {
        metadataId,
        enableDynamicRegistration: this.config.enableDynamicRegistration,
        registrationEndpoint: this.config.registrationEndpoint,
        willIncludeInMetadata: !!this.config.enableDynamicRegistration,
      });

      // Add MCP-specific extensions (configurable via ConfigManager)
      const defaultMcpExtensions = {
        server_name: 'bb-mcp-server',
        server_version: '1.0.0',
        supported_workflows: ['oauth_authorization', 'session_management', 'token_validation'],
        mcp_endpoint: `${this.config.issuer}/mcp`,
      };

      metadata.mcp_extensions = this.config.mcpExtensions
        ? {
          server_name: this.config.mcpExtensions.serverName,
          server_version: this.config.mcpExtensions.serverVersion,
          supported_workflows: [...this.config.mcpExtensions.supportedWorkflows],
          mcp_endpoint: this.config.mcpExtensions.mcpEndpoint ||
            `${this.config.issuer}/mcp`,
          // Optional MCP extension fields (configurable via ConfigManager)
          ...(this.config.mcpExtensions.callbackUrl && {
            callback_url: this.config.mcpExtensions.callbackUrl,
          }),
          ...(this.config.mcpExtensions.upstreamProvider && {
            upstream_provider: this.config.mcpExtensions.upstreamProvider,
          }),
          ...(this.config.mcpExtensions.description && {
            description: this.config.mcpExtensions.description,
          }),
          ...(this.config.mcpExtensions.documentationUrl && {
            documentation_url: this.config.mcpExtensions.documentationUrl,
          }),
        }
        : defaultMcpExtensions;

      // this.logger?.info(
      //   `OAuthMetadata: Generated authorization server metadata successfully [${metadataId}]`,
      //   {
      //     metadataId,
      //     endpoints: {
      //       authorization: !!metadata.authorization_endpoint,
      //       token: !!metadata.token_endpoint,
      //       registration: !!metadata.registration_endpoint,
      //       revocation: !!metadata.revocation_endpoint,
      //     },
      //     capabilities: {
      //       grantTypes: metadata.grant_types_supported.length,
      //       responseTypes: metadata.response_types_supported.length,
      //       scopes: metadata.scopes_supported.length,
      //       pkce: metadata.code_challenge_methods_supported.length > 0,
      //       mcpExtensions: !!metadata.mcp_extensions,
      //     },
      //   },
      // );

      return metadata;
    } catch (error) {
      this.logger?.error(
        `OAuthMetadata: Failed to generate metadata [${metadataId}]:`,
        toError(error),
      );
      throw error;
    }
  }

  /**
   * Get supported token endpoint authentication methods
   *
   * Supports both public clients (PKCE) and confidential clients with secrets.
   */
  private getTokenEndpointAuthMethods(): string[] {
    const methods = [
      'none', // PKCE public clients
      'client_secret_basic', // Basic authentication with client credentials
      'client_secret_post', // POST body authentication with client credentials
    ];

    this.logger?.debug('OAuthMetadata: Determined token endpoint auth methods', {
      methods,
      primaryMethod: 'Multiple methods supported',
    });

    return methods;
  }

  /**
   * Get supported PKCE code challenge methods
   *
   * Returns the PKCE methods supported by the authorization server.
   * We only support S256 for security (plain method is insecure).
   */
  private getCodeChallengeMethods(): string[] {
    if (!this.config.enablePKCE) {
      this.logger?.debug('OAuthMetadata: PKCE disabled, no code challenge methods');
      return [];
    }

    // Only support S256 for security (RFC 7636 recommendation)
    const methods = ['S256'];

    this.logger?.debug('OAuthMetadata: Determined PKCE code challenge methods', {
      methods,
      security: 'S256 only (plain method excluded for security)',
    });

    return methods;
  }

  /**
   * Build complete endpoint URL from relative path
   *
   * Combines the issuer URL with the endpoint path to create complete URLs
   * for the authorization server metadata.
   */
  private buildEndpointUrl(endpointPath: string): string {
    try {
      // Remove leading slash from endpoint path if present
      const cleanPath = endpointPath.startsWith('/') ? endpointPath.slice(1) : endpointPath;

      // Remove trailing slash from issuer if present
      const cleanIssuer = this.config.issuer.endsWith('/')
        ? this.config.issuer.slice(0, -1)
        : this.config.issuer;

      const fullUrl = `${cleanIssuer}/${cleanPath}`;

      // Validate the resulting URL
      new URL(fullUrl); // Throws if invalid

      this.logger?.debug('OAuthMetadata: Built endpoint URL', {
        endpointPath,
        issuer: this.config.issuer,
        fullUrl,
      });

      return fullUrl;
    } catch (error) {
      this.logger?.error('OAuthMetadata: Failed to build endpoint URL:', toError(error), {
        endpointPath,
        issuer: this.config.issuer,
      });
      throw new Error(`Invalid endpoint URL configuration: ${endpointPath}`);
    }
  }

  /**
   * Validate metadata configuration
   *
   * Ensures that the metadata configuration is valid and complete.
   * This helps catch configuration errors early.
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Validate issuer URL
      new URL(this.config.issuer);
    } catch {
      errors.push('Invalid issuer URL');
    }

    // Validate required grant types
    if (this.config.supportedGrantTypes.length === 0) {
      errors.push('At least one grant type must be supported');
    }

    // Validate required response types
    if (this.config.supportedResponseTypes.length === 0) {
      errors.push('At least one response type must be supported');
    }

    // Validate OAuth 2.0 compatibility
    if (!this.config.supportedGrantTypes.includes('authorization_code')) {
      errors.push('authorization_code grant type is required for OAuth 2.0 compliance');
    }

    if (!this.config.supportedResponseTypes.includes('code')) {
      errors.push('code response type is required for authorization_code grant');
    }

    // Validate PKCE configuration
    if (
      this.config.enablePKCE &&
      this.config.supportedGrantTypes.includes('authorization_code') &&
      !this.config.supportedResponseTypes.includes('code')
    ) {
      errors.push('PKCE requires code response type support');
    }

    const isValid = errors.length === 0;

    // this.logger?.info('OAuthMetadata: Configuration validation completed', {
    //   valid: isValid,
    //   errorCount: errors.length,
    //   errors: isValid ? undefined : errors,
    // });

    return {
      valid: isValid,
      errors,
    };
  }

  /**
   * Create OAuth metadata from OAuth provider config
   *
   * Utility method to create OAuthMetadata instance from OAuthProviderConfig.
   * This provides a convenient way to integrate with the main OAuth provider.
   */
  static fromProviderConfig(
    providerConfig: OAuthProviderConfig,
    logger?: Logger,
  ): OAuthMetadata {
    const metadataConfig: OAuthMetadataConfig = {
      // endpoints are hard-coded values from http handlers
      authorizationEndpoint: '/authorize',
      tokenEndpoint: '/token',
      registrationEndpoint: '/register',
      revocationEndpoint: '/revoke',
      metadataEndpoint: '/.well-known/oauth-authorization-server',

      supportedResponseTypes: providerConfig.authorization.supportedResponseTypes ?? ['code'],
      supportedGrantTypes: providerConfig.authorization.supportedGrantTypes ??
        ['authorization_code', 'refresh_token'],
      supportedScopes: providerConfig.authorization.supportedScopes ?? ['read', 'write'],
      enablePKCE: providerConfig.authorization.enablePKCE ?? true,
      enableDynamicRegistration: providerConfig.clients.enableDynamicRegistration ?? true,
      issuer: providerConfig.issuer,
      //...(providerConfig.mcpExtensions && { mcpExtensions: providerConfig.mcpExtensions }),
    };

    return new OAuthMetadata(metadataConfig, logger);
  }

  /**
   * Get the well-known metadata endpoint path
   *
   * Returns the standard RFC 8414 metadata endpoint path.
   */
  static getMetadataEndpointPath(): string {
    return '/.well-known/oauth-authorization-server';
  }

  /**
   * Get metadata as JSON string
   *
   * Convenience method for HTTP responses.
   */
  getMetadataJSON(): string {
    return JSON.stringify(this.generateMetadata(), null, 2);
  }

  /**
   * Get supported grant types
   */
  getSupportedGrantTypes(): string[] {
    return [...this.config.supportedGrantTypes];
  }

  /**
   * Get supported response types
   */
  getSupportedResponseTypes(): string[] {
    return [...this.config.supportedResponseTypes];
  }

  /**
   * Get supported scopes
   */
  getSupportedScopes(): string[] {
    return [...this.config.supportedScopes];
  }

  /**
   * Get supported PKCE code challenge methods
   */
  getCodeChallengeMethodsSupported(): string[] {
    return this.getCodeChallengeMethods();
  }

  /**
   * Get supported token endpoint authentication methods
   */
  getTokenEndpointAuthMethodsSupported(): string[] {
    return this.getTokenEndpointAuthMethods();
  }

  /**
   * Update configuration
   *
   * Allows runtime configuration updates (useful for dynamic server configuration).
   */
  updateConfig(updates: Partial<OAuthMetadataConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };

    this.logger?.info('OAuthMetadata: Configuration updated', {
      updatedFields: Object.keys(updates),
    });
  }
}
