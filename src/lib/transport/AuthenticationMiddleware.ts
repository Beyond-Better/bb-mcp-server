/**
 * Authentication Middleware for MCP Transport
 *
 * 🔒 SECURITY-CRITICAL: Implements MCP authorization per RFC specification
 * with optional third-party session binding and automatic token refresh.
 *
 * Based on legacy MCPRequestHandler.authenticateRequest() with exact
 * security preservation and MCP specification compliance.
 */

import type { Logger } from '../../types/library.types.ts';
import { toError } from '../utils/Error.ts';
import type {
  OAuthProvider,
  //ThirdPartyApiClient,
  //ThirdPartyAuthService,
} from '../auth/OAuthProvider.ts';
import type { OAuthConsumer } from '../auth/OAuthConsumer.ts';

/**
 * Authentication configuration for transport layer
 */
export interface AuthenticationConfig {
  /** Enable authentication for MCP requests */
  enabled: boolean;
  /** Skip authentication even if OAuth components are available */
  skipAuthentication?: boolean;
  /** Require authentication for all MCP endpoints */
  requireAuthentication?: boolean;
}

/**
 * Authentication dependencies for middleware
 */
export interface AuthenticationDependencies {
  /** OAuth provider for MCP token validation (optional) */
  oauthProvider?: OAuthProvider;
  /** OAuth consumer for third-party authentication (optional) */
  oauthConsumer?: OAuthConsumer;
  /** Third-party API client for token refresh (optional) */
  thirdPartyApiClient?: any; // Will be properly typed based on consumer
  /** Logger for security event logging */
  logger?: Logger;
}

/**
 * Authentication result for request processing
 */
export interface AuthenticationResult {
  /** Whether request is authenticated */
  authenticated: boolean;
  /** MCP client ID if authenticated */
  clientId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Granted scopes */
  scope?: string[];
  /** Authentication error message */
  error?: string;
  /** Error code for client handling */
  errorCode?: string;
  /** Action taken during authentication (e.g., token refreshed) */
  actionTaken?: string;
  /** OAuth challenge information for initiating auth flow */
  oauthChallenge?: {
    realm: string;
    authorizationUri: string;
    registrationUri?: string;
    error?: string;
    errorDescription?: string;
  };
}

/**
 * Authentication context for MCP request execution
 */
export interface AuthenticationContext {
  /** Authenticated user ID */
  authenticatedUserId: string;
  /** MCP client ID */
  clientId: string;
  /** Granted scopes */
  scopes: string[];
  /** Request ID for logging */
  requestId: string;
}

/**
 * 🔒 SECURITY-CRITICAL: Authentication Middleware
 *
 * Provides authentication for MCP requests with optional third-party session binding.
 * Preserves exact authentication logic from legacy MCPRequestHandler.authenticateRequest()
 * while following MCP specification requirements.
 */
export class AuthenticationMiddleware {
  private config: AuthenticationConfig;
  private dependencies: AuthenticationDependencies;
  private logger: Logger | undefined;

  constructor(config: AuthenticationConfig, dependencies: AuthenticationDependencies) {
    this.config = config;
    this.dependencies = dependencies;
    this.logger = dependencies.logger;

    this.logger?.info('AuthenticationMiddleware: Initialized', {
      enabled: config.enabled,
      skipAuthentication: config.skipAuthentication,
      hasOAuthProvider: !!dependencies.oauthProvider,
      hasOAuthConsumer: !!dependencies.oauthConsumer,
      hasThirdPartyApiClient: !!dependencies.thirdPartyApiClient,
    });
  }

  /**
   * Determine if authentication is required for a request
   */
  isAuthenticationRequired(url: URL): boolean {
    const pathname = url.pathname;

    // Skip authentication if explicitly disabled
    if (this.config.skipAuthentication) {
      return false;
    }

    // Skip authentication if no OAuth provider available
    if (!this.dependencies.oauthProvider) {
      return false;
    }

    // Skip authentication if not enabled
    if (!this.config.enabled) {
      return false;
    }

    // Never authenticate these endpoints (per MCP spec and OAuth flow requirements)
    const openEndpoints = [
      '/status',
      '/health',
      '/.well-known/oauth-authorization-server',
      '/authorize', // OAuth authorization endpoint must be open
      '/token', // OAuth token endpoint must be open
      '/register', // OAuth registration endpoint must be open for client registration
    ];

    if (openEndpoints.some((endpoint) => pathname === endpoint || pathname.startsWith(endpoint))) {
      return false;
    }

    // Always authenticate MCP endpoints
    const mcpEndpoints = ['/mcp'];
    if (mcpEndpoints.some((endpoint) => pathname === endpoint || pathname.startsWith(endpoint))) {
      return true;
    }

    // Default to requiring authentication if configured
    return this.config.requireAuthentication ?? true;
  }

  /**
   * 🔒 SECURITY-CRITICAL: Authenticate MCP request
   *
   * Preserves exact authentication logic from legacy MCPRequestHandler.authenticateRequest()
   * with full session binding and automatic third-party token refresh.
   */
  async authenticateRequest(
    request: Request,
    requestId: string,
  ): Promise<AuthenticationResult> {
    const startTime = Date.now();

    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get('authorization');

    // this.logger?.info(`AuthenticationMiddleware: Authenticating request [${requestId}]`, {
    //   requestId,
    //   hasAuthHeader: !!authHeader,
    //   authHeaderLength: authHeader?.length || 0,
    //   startsWithBearer: authHeader?.startsWith('Bearer '),
    // });

    if (!authHeader) {
      // Provide OAuth challenge for flow initiation
      this.logger?.warn(
        `AuthenticationMiddleware: Authenticating request [${requestId}] - no authorization header`,
      );
      return {
        authenticated: false,
        error: 'Missing Authorization header',
        oauthChallenge: this.getOAuthChallenge('invalid_request', 'Missing Authorization header'),
      };
    }

    if (!authHeader.startsWith('Bearer ')) {
      this.logger?.warn(
        `AuthenticationMiddleware: Authenticating request [${requestId}] - authorization header has no bearer`,
      );
      return {
        authenticated: false,
        error:
          `Invalid Authorization header format. Expected "Bearer <token>" but received "${authHeader}". Header length: ${authHeader.length}. This appears to be a bug in the MCP client - it should send "Bearer <access_token>".`,
        oauthChallenge: this.getOAuthChallenge(
          'invalid_request',
          'Invalid Authorization header format',
        ),
      };
    }

    const token = authHeader.slice(7).trim(); // Remove 'Bearer ' prefix and trim whitespace

    if (!token || token.length === 0) {
      this.logger?.warn(
        `AuthenticationMiddleware: Authenticating request [${requestId}] - authorization header has no bearer token`,
      );
      return {
        authenticated: false,
        error:
          `Authorization header missing token. Received "${authHeader}" but expected "Bearer <access_token>". This appears to be a bug in the MCP client.`,
        oauthChallenge: this.getOAuthChallenge(
          'invalid_token',
          'Authorization header missing token',
        ),
      };
    }

    if (token.length < 10) {
      this.logger?.warn(
        `AuthenticationMiddleware: Authenticating request [${requestId}] - authorization header bearer token isn't valid format`,
      );
      return {
        authenticated: false,
        error:
          `Authorization token too short. Received token "${token}" (length: ${token.length}) but expected valid access token. This appears to be a bug in the MCP client.`,
        oauthChallenge: this.getOAuthChallenge('invalid_token', 'Authorization token too short'),
      };
    }

    // this.logger?.info(`AuthenticationMiddleware: Validating OAuth token [${requestId}]`, {
    //   requestId,
    //   tokenPrefix: token.substring(0, 12) + '...',
    // });

    // 🔒 SECURITY-CRITICAL: Use OAuth provider to validate token with session binding
    try {
      let authResult;

      if (this.dependencies.oauthConsumer && this.dependencies.thirdPartyApiClient) {
        // Full session binding: validate MCP token AND third-party token with auto-refresh
        authResult = await this.dependencies.oauthProvider!.authorizeMCPRequest(
          authHeader,
          this.dependencies.oauthConsumer as any, // Cast to ThirdPartyAuthService interface
          this.dependencies.thirdPartyApiClient,
        );
      } else if (this.dependencies.oauthConsumer) {
        // Session binding without auto-refresh: validate MCP token AND third-party token
        authResult = await this.dependencies.oauthProvider!.authorizeMCPRequest(
          authHeader,
          this.dependencies.oauthConsumer as any, // Cast to ThirdPartyAuthService interface
        );
      } else {
        // MCP token only: validate MCP token without session binding
        const validation = await this.dependencies.oauthProvider!.validateAccessToken(token);
        authResult = {
          authorized: validation.valid,
          clientId: validation.clientId,
          userId: validation.userId,
          scope: validation.scope ? validation.scope.split(' ') : undefined,
          error: validation.error,
          errorCode: validation.errorCode,
          actionTaken: validation.actionTaken,
        };
      }
      // this.logger?.info(
      //   `AuthenticationMiddleware: Authenticating request [${requestId}] - authResult`,
      //   authResult,
      // );

      if (!authResult.authorized) {
        this.logger?.warn(`AuthenticationMiddleware: Token validation failed [${requestId}]`, {
          requestId,
          error: authResult.error,
          errorCode: authResult.errorCode,
          actionTaken: authResult.actionTaken,
          tokenPrefix: token.substring(0, 12) + '...',
          duration: Date.now() - startTime,
        });

        // Generate OAuth challenge with third-party authorization URL if needed
        let oauthChallenge = this.getOAuthChallenge(
          this.mapErrorCodeToOAuthError(authResult.errorCode),
          authResult.error || 'Invalid access token',
        );

        // If third-party auth is required and we have an OAuth consumer, generate the auth URL
        if (
          authResult.errorCode === 'third_party_auth_required' && this.dependencies.oauthConsumer &&
          authResult.userId
        ) {
          try {
            // Start the third-party authorization flow to get the URL
            const authFlow = await this.dependencies.oauthConsumer.startAuthorizationFlow(
              authResult.userId,
            );

            // Replace the OAuth challenge with the third-party authorization URL
            oauthChallenge = {
              realm: 'third-party-api',
              authorizationUri: authFlow.authorizationUrl,
              error: 'third_party_auth_required',
              errorDescription: authResult.error || 'Third-party authentication required',
            };

            this.logger?.info(
              `AuthenticationMiddleware: Generated third-party OAuth challenge [${requestId}]`,
              {
                requestId,
                userId: authResult.userId,
                authorizationUrl: authFlow.authorizationUrl,
                state: authFlow.state,
              },
            );
          } catch (error) {
            this.logger?.error(
              `AuthenticationMiddleware: Failed to generate third-party auth URL [${requestId}]:`,
              toError(error),
              {
                requestId,
                userId: authResult.userId,
              },
            );
          }
        }

        return {
          authenticated: false,
          error: authResult.error || 'Invalid access token',
          errorCode: authResult.errorCode || '',
          actionTaken: authResult.actionTaken || '',
          ...(authResult.clientId && { clientId: authResult.clientId }),
          ...(authResult.userId && { userId: authResult.userId }),
          oauthChallenge,
        };
      }

      this.logger?.debug(`AuthenticationMiddleware: Token validation successful [${requestId}]`, {
        requestId,
        clientId: authResult.clientId,
        userId: authResult.userId,
        scopes: authResult.scope?.length || 0,
        actionTaken: authResult.actionTaken,
        duration: Date.now() - startTime,
      });

      return {
        authenticated: true,
        actionTaken: authResult.actionTaken || '',
        ...(authResult.clientId && { clientId: authResult.clientId }),
        ...(authResult.userId && { userId: authResult.userId }),
        ...(authResult.scope && { scope: authResult.scope }),
      };
    } catch (error) {
      this.logger?.error(
        `AuthenticationMiddleware: Authentication error [${requestId}]:`,
        toError(error),
        {
          requestId,
          duration: Date.now() - startTime,
        },
      );

      return {
        authenticated: false,
        error: 'Authentication service error',
        oauthChallenge: this.getOAuthChallenge('invalid_token', 'Authentication service error'),
      };
    }
  }

  /**
   * Create authentication context for MCP request execution
   */
  createAuthContext(authResult: AuthenticationResult, requestId: string): AuthenticationContext {
    if (!authResult.authenticated || !authResult.clientId || !authResult.userId) {
      throw new Error('Cannot create auth context for unauthenticated request');
    }

    return {
      authenticatedUserId: authResult.userId,
      clientId: authResult.clientId,
      scopes: authResult.scope || [],
      requestId,
    };
  }

  /**
   * Determine HTTP status code based on authentication error
   */
  getAuthErrorStatus(authResult: AuthenticationResult): number {
    switch (authResult.errorCode) {
      case 'third_party_reauth_required':
      case 'actionstep_reauth_required':
        // 403 Forbidden indicates that re-authentication is needed
        return 403;
      case 'mcp_token_expired':
        // 401 Unauthorized indicates MCP token refresh is needed
        return 401;
      default:
        // Default to 401 for authentication-related errors
        return 401;
    }
  }

  /**
   * Get client guidance for authentication errors
   */
  getClientGuidance(errorCode?: string): string {
    switch (errorCode) {
      case 'third_party_reauth_required':
      case 'actionstep_reauth_required':
        return 'Third-party authentication expired and refresh failed. Stop retrying and prompt user for browser-based re-authentication.';
      case 'mcp_token_expired':
        return 'MCP access token expired. Refresh MCP token using refresh_token grant.';
      default:
        return 'Authentication failed. Check token validity and user permissions.';
    }
  }

  /**
   * Get OAuth challenge information for WWW-Authenticate header
   */
  getOAuthChallenge(
    error?: string,
    errorDescription?: string,
  ): {
    realm: string;
    authorizationUri: string;
    registrationUri?: string;
    error?: string;
    errorDescription?: string;
  } {
    // Build authorization URI from OAuth provider if available
    let authorizationUri = '/authorize';
    let registrationUri = '/register';

    if (this.dependencies.oauthProvider) {
      try {
        const metadata = this.dependencies.oauthProvider.getAuthorizationServerMetadata();
        authorizationUri = metadata.authorization_endpoint || authorizationUri;
        // Use registration_endpoint if available, otherwise build from issuer
        if (metadata.registration_endpoint) {
          registrationUri = metadata.registration_endpoint;
        } else if (metadata.issuer) {
          // Build full URL from issuer if registration endpoint not in metadata
          registrationUri = `${metadata.issuer}/register`;
        }
      } catch (err) {
        this.logger?.warn('AuthenticationMiddleware: Failed to get OAuth metadata', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      realm: 'mcp-server',
      authorizationUri,
      registrationUri,
      ...(error && { error }),
      ...(errorDescription && { errorDescription }),
    };
  }

  /**
   * Build WWW-Authenticate header value from OAuth challenge
   */
  buildWWWAuthenticateHeader(
    challenge: NonNullable<AuthenticationResult['oauthChallenge']>,
  ): string {
    const parts = [
      `realm="${challenge.realm}"`,
      `authorization_uri="${challenge.authorizationUri}"`,
    ];

    if (challenge.registrationUri) {
      parts.push(`registration_uri="${challenge.registrationUri}"`);
    }

    if (challenge.error) {
      parts.push(`error="${challenge.error}"`);
    }

    if (challenge.errorDescription) {
      parts.push(`error_description="${challenge.errorDescription}"`);
    }

    return `Bearer ${parts.join(', ')}`;
  }

  /**
   * Map internal error codes to OAuth 2.0 error codes
   */
  private mapErrorCodeToOAuthError(errorCode?: string): string {
    switch (errorCode) {
      case 'mcp_token_expired':
        return 'invalid_token';
      case 'third_party_reauth_required':
      case 'actionstep_reauth_required':
        return 'invalid_token';
      default:
        return 'invalid_token';
    }
  }

  /**
   * Add authentication context to request headers for downstream processing
   */
  addAuthContextToRequest(
    request: Request,
    authResult: AuthenticationResult,
  ): Request {
    // Create new request with additional auth context headers
    const headers = new Headers(request.headers);

    if (authResult.clientId) {
      headers.set('X-MCP-Client-ID', authResult.clientId);
    }

    if (authResult.userId) {
      headers.set('X-MCP-User-ID', authResult.userId);
    }

    if (authResult.scope) {
      headers.set('X-MCP-Scope', authResult.scope.join(' '));
    }

    // Mark request as authenticated
    headers.set('X-MCP-Authenticated', 'true');

    return new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
    });
  }
}
