/**
 * ExampleCorp OAuth Consumer
 *
 * Demonstrates how to extend the library's OAuth infrastructure for third-party API integration:
 * - Extends library OAuthConsumer base class
 * - Configures provider-specific OAuth flows
 * - Handles ExampleCorp-specific token management
 * - Integrates with library credential storage and session management
 */

// 🎯 Library imports - OAuth infrastructure
import {
  OAuthConsumer,
  type OAuthConsumerConfig,
  type OAuthConsumerDependencies,
  type OAuthCredentials,
  type TokenResult,
} from '@beyondbetter/bb-mcp-server';

export interface ExampleOAuthConfig extends OAuthConsumerConfig {
  // ExampleCorp-specific configuration
  exampleCorp: {
    apiBaseUrl: string;
    apiVersion: string;
    scopes: string[];
    customClaims?: Record<string, any>;
  };
}

/**
 * ExampleCorp OAuth Consumer
 *
 * 🎯 EXTENDS library OAuthConsumer for ExampleCorp API integration
 * 🎯 Library handles: token storage, refresh logic, credential management
 * 🎯 Consumer handles: ExampleCorp-specific OAuth flow, custom token processing
 */
export class ExampleOAuthConsumer extends OAuthConsumer {
  private exampleConfig: ExampleOAuthConfig['exampleCorp'];

  constructor(
    config: ExampleOAuthConfig,
    dependencies: OAuthConsumerDependencies,
  ) {
    // 🎯 Call parent with ExampleCorp OAuth configuration
    super(
      {
        // Standard OAuth 2.0 configuration for ExampleCorp
        authUrl: `${config.exampleCorp.apiBaseUrl}/oauth/authorize`,
        tokenUrl: `${config.exampleCorp.apiBaseUrl}/oauth/token`,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        scopes: config.exampleCorp.scopes,

        // ExampleCorp OAuth configuration
        providerId: 'examplecorp',
        tokenRefreshBufferMinutes: 5,
        maxTokenRefreshRetries: 3,
      },
      {
        logger: dependencies.logger,
        kvManager: dependencies.kvManager,
        credentialStore: dependencies.credentialStore,
      },
    );

    this.exampleConfig = config.exampleCorp;
  }

  /**
   * 🎯 Override: ExampleCorp-specific authorization URL building
   * Library handles: PKCE challenge generation, state management, base URL construction
   */
  protected override buildAuthUrl(
    state: string,
    codeChallenge?: string,
  ): string {
    // 🎯 Call parent to build base OAuth URL (library handles PKCE, scopes, etc.)
    const baseUrl = super.buildAuthUrl(state, codeChallenge);

    // 🎯 Add ExampleCorp-specific parameters
    const url = new URL(baseUrl);
    url.searchParams.set('api_version', this.exampleConfig.apiVersion);

    // ExampleCorp requires a 'prompt' parameter for certain flows
    url.searchParams.set('prompt', 'consent');

    this.logger?.debug('ExampleCorp authorization URL built', {
      baseUrl,
      finalUrl: url.toString(),
      apiVersion: this.exampleConfig.apiVersion,
    });

    return url.toString();
  }

  /**
   * 🎯 Override: ExampleCorp-specific token exchange (using httpbin for demo)
   * Library handles: HTTP request, PKCE verification, credential storage
   */
  protected override async exchangeCodeForTokens(
    code: string,
    codeVerifier?: string,
  ): Promise<TokenResult> {
    try {
      // 🎯 Use httpbin /anything/oauth/token for demo OAuth flow
      const response = await fetch('https://httpbin.org/anything/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          code_verifier: codeVerifier || '',

          // mock values to get passed back
          access_token: `demo-access-token-${Date.now()}`,
          refresh_token: `demo-access-token-${Date.now()}`,
        }).toString(),
      });

      const httpbinResponse = await response.json();

      // 🎯 Transform httpbin response to OAuth token format
      const tokens: OAuthCredentials & Record<string, any> = {
        accessToken: httpbinResponse.args.access_token,
        refreshToken: httpbinResponse.args.refresh_token,
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000, // 1 hour from now (timestamp)
        scopes: this.config.scopes,
        // Mock ExampleCorp-specific fields
        organization_id: 'demo-org-123',
        user_permissions: ['read', 'write'],
        rate_limit_tier: 'premium',
      };

      const result: TokenResult = {
        success: true,
        tokens,
      };

      // 🎯 ExampleCorp-specific token processing
      const exampleCorpMetadata = this.extractExampleCorpMetadata(tokens);
      const userId = codeVerifier || 'demo-user';
      await this.storeExampleCorpMetadata(userId, exampleCorpMetadata);

      this.logger?.info('ExampleCorp token exchange successful (demo)', {
        scopes: tokens.scopes || [],
        expiresAt: tokens.expiresAt,
        hasRefreshToken: !!tokens.refreshToken,
        metadata: exampleCorpMetadata,
      });

      return result;
    } catch (error) {
      this.logger?.error(
        'ExampleCorp token exchange failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      };
    }
  }

  /**
   * 🎯 Override: ExampleCorp-specific token refresh
   * Library handles: HTTP request, credential storage, error handling
   */
  protected override async refreshTokens(
    refreshToken: string,
  ): Promise<TokenResult> {
    try {
      // 🎯 Call parent for standard token refresh (library handles HTTP, storage)
      const result = await super.refreshTokens(refreshToken);

      // 🎯 ExampleCorp-specific refresh processing
      if (result.success && result.tokens) {
        // ExampleCorp may include updated metadata on refresh
        const exampleCorpMetadata = this.extractExampleCorpMetadata(
          result.tokens,
        );
        if (Object.keys(exampleCorpMetadata).length > 0) {
          await this.storeExampleCorpMetadata(
            refreshToken,
            exampleCorpMetadata,
          ); // Use refresh token as identifier
        }

        this.logger?.debug('ExampleCorp token refresh successful', {
          expiresAt: result.tokens.expiresAt,
          metadata: exampleCorpMetadata,
        });
      }

      return result;
    } catch (error) {
      this.logger?.error(
        'ExampleCorp token refresh failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * 🎯 Public: Get access token with ExampleCorp-specific validation
   * Library handles: token retrieval, automatic refresh, credential storage
   */
  override async getAccessToken(userId: string): Promise<string | null> {
    try {
      // 🎯 Call parent to get token (library handles refresh logic)
      const accessToken = await super.getAccessToken(userId);

      if (!accessToken) {
        return null;
      }

      // 🎯 ExampleCorp-specific token validation
      await this.validateExampleCorpToken(accessToken, userId);

      return accessToken;
    } catch (error) {
      this.logger?.error(
        'ExampleCorp access token retrieval failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      throw error;
    }
  }

  /**
   * 🎯 Public: Initialize ExampleCorp OAuth consumer
   */
  override async initialize(): Promise<void> {
    try {
      // Verify ExampleCorp API connectivity
      await this.verifyExampleCorpEndpoints();

      this.logger?.info('ExampleCorp OAuth consumer initialized', {
        authUrl: this.config.authUrl,
        tokenUrl: this.config.tokenUrl,
        apiVersion: this.exampleConfig.apiVersion,
        scopes: this.config.scopes,
      });
    } catch (error) {
      this.logger?.error(
        'ExampleCorp OAuth consumer initialization failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * 🎯 Public: Cleanup ExampleCorp OAuth consumer
   */
  async cleanup(): Promise<void> {
    // Any ExampleCorp-specific cleanup
    this.logger?.info('ExampleCorp OAuth consumer cleanup complete');
  }

  // =============================================================================
  // EXAMPLECORP-SPECIFIC PRIVATE METHODS
  // =============================================================================

  /**
   * Extract ExampleCorp-specific metadata from token response
   */
  private extractExampleCorpMetadata(
    tokens: OAuthCredentials,
  ): Record<string, any> {
    const metadata: Record<string, any> = {};

    // ExampleCorp includes custom fields in token response
    if ('organization_id' in tokens) {
      metadata.organizationId = tokens.organization_id;
    }
    if ('user_permissions' in tokens) {
      metadata.userPermissions = tokens.user_permissions;
    }
    if ('rate_limit_tier' in tokens) {
      metadata.rateLimitTier = tokens.rate_limit_tier;
    }

    return metadata;
  }

  /**
   * Store ExampleCorp-specific metadata
   */
  private async storeExampleCorpMetadata(
    userId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    if (Object.keys(metadata).length === 0) return;

    // 🎯 Use library KV storage
    await this.kvManager.set(
      ['oauth', 'examplecorp', 'metadata', userId],
      metadata,
      { expireIn: 24 * 60 * 60 * 1000 }, // 24 hours
    );

    this.logger?.debug('ExampleCorp metadata stored', { userId, metadata });
  }

  /**
   * Validate ExampleCorp-specific token requirements (demo mode)
   */
  private async validateExampleCorpToken(
    accessToken: string,
    userId: string,
  ): Promise<void> {
    // Demo token format validation (allow demo tokens)
    if (
      !accessToken.startsWith('demo-access-token-') &&
      !accessToken.startsWith('exc_')
    ) {
      throw new Error('Invalid ExampleCorp access token format');
    }

    // Check ExampleCorp-specific metadata
    const metadata = await this.kvManager.get([
      'oauth',
      'examplecorp',
      'metadata',
      userId,
    ]);
    if (!metadata) {
      this.logger?.warn('No ExampleCorp metadata found for user', { userId });
    }
  }

  /**
   * Verify ExampleCorp OAuth endpoints (using httpbin for demo)
   */
  private async verifyExampleCorpEndpoints(): Promise<void> {
    try {
      // Verify httpbin OAuth endpoints are accessible
      const authResponse = await fetch(
        'https://httpbin.org/anything/oauth/authorize',
      );
      const tokenResponse = await fetch(
        'https://httpbin.org/anything/oauth/token',
        {
          method: 'POST',
        },
      );

      if (!authResponse.ok || !tokenResponse.ok) {
        throw new Error('httpbin OAuth endpoints not accessible');
      }

      // Mock discovery response for demo purposes
      const discovery = {
        authorization_endpoint: 'https://httpbin.org/anything/oauth/authorize',
        token_endpoint: 'https://httpbin.org/anything/oauth/token',
        scopes_supported: ['read', 'write', 'admin'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        response_types_supported: ['code'],
      };

      this.logger?.debug('ExampleCorp OAuth endpoints verified (demo)', {
        authEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        supportedScopes: discovery.scopes_supported,
      });
    } catch (error) {
      this.logger?.warn('ExampleCorp OAuth endpoint verification failed', {});
      // Don't fail initialization - endpoints might still work
    }
  }
}

/**
 * LIBRARY VALIDATION:
 *
 * This file demonstrates OAuth consumer extension patterns:
 *
 * ✅ Base Functionality: Library OAuthConsumer handles core OAuth 2.0 flow (~0 lines)
 * ✅ Token Management: Library handles storage, refresh, expiration (~0 lines)
 * ✅ PKCE Support: Library handles PKCE challenge generation/verification (~0 lines)
 * ✅ HTTP Handling: Library handles OAuth HTTP requests (~0 lines)
 * ✅ Credential Storage: Library KV storage integration (~2 lines)
 * ✅ Error Handling: Library error handling patterns (~5 lines)
 * ✅ Custom Logic: ExampleCorp-specific extensions (~60 lines)
 * ✅ Provider Integration: Clean separation of generic vs provider-specific
 *
 * ARCHITECTURE BENEFITS:
 * - OAuth Infrastructure: Complete OAuth 2.0 implementation in library
 * - Provider Flexibility: Easy to extend for any OAuth provider
 * - Token Security: Library handles secure token storage and refresh
 * - Error Recovery: Library handles OAuth error scenarios
 * - Testing: Provider-specific logic easily testable in isolation
 */
