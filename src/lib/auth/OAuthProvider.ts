/**
 * OAuth Provider - OAuth 2.0 Authorization Server Core
 *
 * 🔒 SECURITY-CRITICAL: This is the main OAuth 2.0 Authorization Server implementation
 * that coordinates all OAuth components. It provides the complete OAuth 2.0 authorization
 * server functionality with RFC compliance and security preservation from OAuthClientService.ts.
 *
 * Security Requirements:
 * - RFC 6749 OAuth 2.0 Authorization Framework compliance
 * - RFC 7636 PKCE (Proof Key for Code Exchange) integration
 * - RFC 7591 Dynamic Client Registration support
 * - RFC 8414 Authorization Server Metadata endpoint
 * - Complete MCP session binding for third-party OAuth integration
 * - Comprehensive security logging and audit trails
 */

import type { Logger } from '../../types/library.types.ts';
import type { KVManager } from '../storage/KVManager.ts';
import type { CredentialStore } from '../storage/CredentialStore.ts';
import { toError } from '../utils/Error.ts';

import { TokenManager } from './TokenManager.ts';
import { PKCEHandler } from './PKCEHandler.ts';
import { ClientRegistry } from './ClientRegistry.ts';
import { AuthorizationHandler } from './AuthorizationHandler.ts';
import { OAuthMetadata } from './OAuthMetadata.ts';

import type {
  AuthorizationServerMetadata,
  AuthorizeRequest,
  AuthorizeResponse,
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  MCPAuthContext,
  MCPAuthorizationRequest,
  OAuthProviderConfig,
  TokenIntrospection,
  TokenMapping,
  TokenRequest,
  TokenResponse,
  TokenValidation,
} from './OAuthTypes.ts';

/**
 * Dependencies required by OAuthProvider
 */
export interface OAuthProviderDependencies {
  /** KV storage manager for OAuth data persistence */
  kvManager: KVManager;
  /** Credential store for secure token storage */
  credentialStore: CredentialStore;
  /** Logger for security event logging */
  logger?: Logger;
}

/**
 * Third-party authentication service interface for MCP session binding
 * 
 * This interface allows the OAuth provider to validate third-party tokens
 * and maintain session binding between MCP tokens and external provider tokens.
 */
export interface ThirdPartyAuthService {
  /** Get user credentials from third-party provider */
  getUserCredentials(userId: string): Promise<any>;
  /** Check if user is authenticated with third-party provider */
  isUserAuthenticated(userId: string): Promise<boolean>;
  /** Update user credentials after token refresh */
  updateUserCredentials(userId: string, tokens: any): Promise<boolean>;
}

// Note: OAuthConsumer implements ThirdPartyAuthService methods via duck typing
// The interface compatibility is handled at runtime

/**
 * Third-party API client interface for automatic token refresh
 */
export interface ThirdPartyApiClient {
  /** Refresh access token using refresh token */
  refreshAccessToken(refreshToken: string): Promise<any>;
}

/**
 * 🔒 SECURITY-CRITICAL: OAuth 2.0 Authorization Server
 *
 * Complete OAuth 2.0 Authorization Server implementation with exact security preservation
 * from the original OAuthClientService.ts. Coordinates all OAuth components to provide
 * RFC-compliant authorization server functionality.
 *
 * Key Security Features:
 * - Complete OAuth 2.0 authorization server (RFC 6749, 7636, 7591, 8414)
 * - MCP session binding with third-party OAuth providers
 * - Automatic token refresh for third-party integrations
 * - Comprehensive security logging and audit trails
 * - PKCE enforcement for public clients
 * - Dynamic client registration with security validation
 */
export class OAuthProvider {
  private config: OAuthProviderConfig;
  private logger: Logger | undefined;

  // OAuth components
  private tokenManager: TokenManager;
  private pkceHandler: PKCEHandler;
  private clientRegistry: ClientRegistry;
  private authorizationHandler: AuthorizationHandler;
  private metadataHandler: OAuthMetadata;

  // Dependencies
  private kvManager: KVManager;
  private credentialStore: CredentialStore;

  constructor(config: OAuthProviderConfig, dependencies: OAuthProviderDependencies) {
    this.config = config;
    this.kvManager = dependencies.kvManager;
    this.credentialStore = dependencies.credentialStore;
    this.logger = dependencies.logger;

    // Initialize OAuth components
    this.tokenManager = new TokenManager(
      {
        accessTokenExpiryMs: config.tokens.accessTokenExpiryMs,
        refreshTokenExpiryMs: config.tokens.refreshTokenExpiryMs,
        authorizationCodeExpiryMs: config.tokens.authorizationCodeExpiryMs,
      },
      {
        kvManager: this.kvManager,
        logger: this.logger,
      },
    );

    this.pkceHandler = new PKCEHandler(this.logger);

    this.clientRegistry = new ClientRegistry(
      {
        enableDynamicRegistration: config.clients.enableDynamicRegistration,
        requireHTTPS: config.clients.requireHTTPS,
        allowedRedirectHosts: config.clients.allowedRedirectHosts,
      },
      {
        kvManager: this.kvManager,
        logger: this.logger,
      },
    );

    this.authorizationHandler = new AuthorizationHandler(
      {
        supportedGrantTypes: config.authorization.supportedGrantTypes,
        supportedResponseTypes: config.authorization.supportedResponseTypes,
        supportedScopes: config.authorization.supportedScopes,
        enablePKCE: config.authorization.enablePKCE,
        requirePKCE: config.authorization.requirePKCE,
        issuer: config.issuer,
      },
      {
        kvManager: this.kvManager,
        logger: this.logger,
        clientRegistry: this.clientRegistry,
        pkceHandler: this.pkceHandler,
        tokenManager: this.tokenManager,
      },
    );

    this.metadataHandler = OAuthMetadata.fromProviderConfig(config, this.logger);

    this.logger?.info('OAuthProvider: Initialized OAuth 2.0 Authorization Server', {
      issuer: config.issuer,
      features: {
        pkce: config.authorization.enablePKCE,
        dynamicRegistration: config.clients.enableDynamicRegistration,
        supportedGrantTypes: config.authorization.supportedGrantTypes.length,
        supportedScopes: config.authorization.supportedScopes.length,
      },
    });
  }

  /**
   * 🔒 SECURITY-CRITICAL: Handle OAuth authorization request
   *
   * Processes OAuth authorization requests and generates authorization responses.
   * This is the entry point for the OAuth authorization code flow.
   */
  async handleAuthorizeRequest(
    request: AuthorizeRequest,
    userId: string,
  ): Promise<AuthorizeResponse> {
    const authId = Math.random().toString(36).substring(2, 15);

    this.logger?.info(`OAuthProvider: Processing authorization request [${authId}]`, {
      authId,
      clientId: request.client_id,
      responseType: request.response_type,
      hasPKCE: !!(request.code_challenge && request.code_challenge_method),
      userId,
    });

    try {
      return await this.authorizationHandler.handleAuthorizeRequest(request, userId);
    } catch (error) {
      this.logger?.error(
        `OAuthProvider: Authorization request failed [${authId}]:`,
        toError(error),
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Handle OAuth token request
   *
   * Processes token requests for both authorization_code and refresh_token grants.
   * Includes comprehensive validation and security checks.
   */
  async handleTokenRequest(request: TokenRequest): Promise<TokenResponse> {
    const tokenId = Math.random().toString(36).substring(2, 15);

    this.logger?.info(`OAuthProvider: Processing token request [${tokenId}]`, {
      tokenId,
      grantType: request.grant_type,
      clientId: request.client_id,
      hasCodeVerifier: !!request.code_verifier,
    });

    try {
      if (request.grant_type === 'authorization_code') {
        return await this.handleAuthorizationCodeGrant(request);
      } else if (request.grant_type === 'refresh_token') {
        return await this.handleRefreshTokenGrant(request);
      } else {
        throw new Error(`Unsupported grant type: ${request.grant_type}`);
      }
    } catch (error) {
      this.logger?.error(`OAuthProvider: Token request failed [${tokenId}]:`, toError(error));
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Handle client registration request
   *
   * Processes dynamic client registration requests per RFC 7591.
   */
  async handleClientRegistration(
    request: ClientRegistrationRequest,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<ClientRegistrationResponse> {
    const regId = Math.random().toString(36).substring(2, 15);

    this.logger?.info(`OAuthProvider: Processing client registration [${regId}]`, {
      regId,
      clientName: request.client_name,
      redirectUriCount: request.redirect_uris?.length || 0,
    });

    try {
      return await this.clientRegistry.registerClient(request, metadata);
    } catch (error) {
      this.logger?.error(`OAuthProvider: Client registration failed [${regId}]:`, toError(error));
      throw error;
    }
  }

  /**
   * Get OAuth 2.0 Authorization Server Metadata (RFC 8414)
   */
  getAuthorizationServerMetadata(): AuthorizationServerMetadata {
    return this.metadataHandler.generateMetadata();
  }

  /**
   * 🔒 SECURITY-CRITICAL: Validate MCP access token with session binding
   *
   * Preserves exact token validation logic from OAuthClientService.validateMCPAccessToken()
   * with automatic external token refresh capability for MCP session binding.
   */
  async validateMCPAccessToken(
    token: string,
    authService?: ThirdPartyAuthService,
    apiClient?: ThirdPartyApiClient,
  ): Promise<{
    valid: boolean;
    clientId?: string;
    userId?: string;
    scope?: string;
    error?: string;
    errorCode?: string;
    actionTaken?: string;
  }> {
    const validationId = Math.random().toString(36).substring(2, 15);

    try {
      // 1. Check if MCP token exists and is valid
      const tokenValidation = await this.tokenManager.validateAccessToken(token);

      if (!tokenValidation.valid) {
        this.logger?.warn(`OAuthProvider: MCP token validation failed [${validationId}]`, {
          validationId,
          error: tokenValidation.error,
          errorCode: tokenValidation.errorCode,
        });
        const result: {
          valid: boolean;
          clientId?: string;
          userId?: string;
          scope?: string;
          error?: string;
          errorCode?: string;
          actionTaken?: string;
        } = {
          valid: false,
        };

        if (tokenValidation.error) {
          result.error = tokenValidation.error;
        }
        if (tokenValidation.errorCode) {
          result.errorCode = tokenValidation.errorCode;
        }

        return result;
      }

      // 2. 🔒 SECURITY-CRITICAL: SESSION BINDING REQUIREMENT - Validate third-party token status
      if (authService) {
        const isThirdPartyValid = await authService.isUserAuthenticated(tokenValidation.userId!);

        if (!isThirdPartyValid) {
          this.logger?.warn(`OAuthProvider: Third-party token expired [${validationId}]`, {
            validationId,
            userId: tokenValidation.userId,
            clientId: tokenValidation.clientId,
          });

          // ATTEMPT THIRD-PARTY TOKEN REFRESH before failing
          if (apiClient && authService.updateUserCredentials) {
            this.logger?.info(
              `OAuthProvider: Attempting third-party token refresh [${validationId}]`,
              {
                validationId,
                userId: tokenValidation.userId,
              },
            );

            try {
              // Get current credentials to extract refresh token
              const credentials = await authService.getUserCredentials(tokenValidation.userId!);

              if (credentials && credentials.tokens && credentials.tokens.refreshToken) {
                // Attempt to refresh the third-party token
                const refreshedTokens = await apiClient.refreshAccessToken(
                  credentials.tokens.refreshToken,
                );

                if (refreshedTokens) {
                  // Update stored credentials with new tokens
                  const updateSuccess = await authService.updateUserCredentials(
                    tokenValidation.userId!,
                    refreshedTokens,
                  );

                  if (updateSuccess) {
                    this.logger?.info(
                      `OAuthProvider: Successfully refreshed third-party token [${validationId}]`,
                      {
                        validationId,
                        userId: tokenValidation.userId,
                      },
                    );

                    return {
                      valid: true,
                      ...(tokenValidation.clientId && { clientId: tokenValidation.clientId }),
                      ...(tokenValidation.userId && { userId: tokenValidation.userId }),
                      ...(tokenValidation.scopes && { scope: tokenValidation.scopes.join(' ') }),
                      actionTaken: 'third_party_token_refreshed',
                    };
                  }
                }
              }
            } catch (refreshError) {
              this.logger?.error(
                `OAuthProvider: Third-party token refresh failed [${validationId}]:`,
                toError(refreshError),
                {
                  validationId,
                },
              );
            }
          }

          // If we reach here, token refresh failed
          const errorMsg =
            `Third-party token refresh failed, invalidating MCP token [${validationId}]`;
          this.logger?.error(`OAuthProvider: ${errorMsg}`, toError(errorMsg), {
            validationId,
            userId: tokenValidation.userId,
          });

          return {
            valid: false,
            error:
              'Third-party authorization expired and refresh failed. User must re-authenticate.',
            errorCode: 'third_party_reauth_required',
            ...(tokenValidation.clientId && { clientId: tokenValidation.clientId }),
            ...(tokenValidation.userId && { userId: tokenValidation.userId }),
          };
        }
      }

      // 3. Token is valid with session binding confirmed
      const result: {
        valid: boolean;
        clientId?: string;
        userId?: string;
        scope?: string;
        error?: string;
        errorCode?: string;
        actionTaken?: string;
      } = {
        valid: true,
      };

      if (tokenValidation.clientId) {
        result.clientId = tokenValidation.clientId;
      }
      if (tokenValidation.userId) {
        result.userId = tokenValidation.userId;
      }
      if (tokenValidation.scopes) {
        result.scope = tokenValidation.scopes.join(' ');
      }

      return result;
    } catch (error) {
      this.logger?.error(
        `OAuthProvider: MCP token validation error [${validationId}]:`,
        toError(error),
        {
          validationId,
        },
      );
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Authorize MCP request with session binding
   *
   * This is the primary method for validating MCP requests that implements
   * all MCP session binding requirements with automatic third-party token refresh.
   */
  async authorizeMCPRequest(
    bearerToken: string,
    authService: ThirdPartyAuthService,
    apiClient?: ThirdPartyApiClient,
  ): Promise<MCPAuthContext> {
    const authId = Math.random().toString(36).substring(2, 15);

    if (!bearerToken) {
      return { authorized: false, error: 'Missing authorization header' };
    }

    // Extract token from Bearer header
    const token = bearerToken.startsWith('Bearer ') ? bearerToken.slice(7) : bearerToken;

    // Validate MCP token with session binding and automatic third-party token refresh
    const validation = await this.validateMCPAccessToken(token, authService, apiClient);

    if (!validation.valid) {
      this.logger?.warn(`OAuthProvider: MCP request authorization failed [${authId}]`, {
        authId,
        error: validation.error,
        errorCode: validation.errorCode,
        actionTaken: validation.actionTaken,
      });

      return {
        authorized: false,
        error: validation.error || 'Invalid access token',
        errorCode: validation.errorCode || '',
        actionTaken: validation.actionTaken || '',
        ...(validation.clientId && { clientId: validation.clientId }),
        ...(validation.userId && { userId: validation.userId }),
      };
    }

    // Parse scope into array
    const scopes = validation.scope ? validation.scope.split(' ') : ['read', 'write'];

    return {
      authorized: true,
      clientId: validation.clientId!,
      userId: validation.userId!,
      scope: scopes,
      actionTaken: validation.actionTaken || '',
    };
  }

  /**
   * Store MCP authorization request for session binding
   */
  async storeMCPAuthRequest(
    externalState: string,
    request: MCPAuthorizationRequest,
  ): Promise<void> {
    return await this.authorizationHandler.storeMCPAuthRequest(externalState, request);
  }

  /**
   * Retrieve MCP authorization request by External state
   */
  async getMCPAuthRequest(externalState: string): Promise<MCPAuthorizationRequest | null> {
    return await this.authorizationHandler.getMCPAuthRequest(externalState);
  }

  /**
   * Introspect token (RFC 7662 style)
   */
  async introspectToken(token: string): Promise<TokenIntrospection> {
    try {
      const validation = await this.tokenManager.validateAccessToken(token);

      if (!validation.valid) {
        return { active: false };
      }

      return {
        active: true,
        ...(validation.clientId && { client_id: validation.clientId }),
        ...(validation.userId && { user_id: validation.userId }),
        ...(validation.scopes && { scope: validation.scopes.join(' ') }),
      };
    } catch (error) {
      this.logger?.error('OAuthProvider: Token introspection failed:', toError(error));
      return { active: false };
    }
  }

  /**
   * Validate access token (alias for validateMCPAccessToken for compatibility)
   */
  async validateAccessToken(token: string): Promise<{
    valid: boolean;
    clientId?: string;
    userId?: string;
    scope?: string;
    error?: string;
    errorCode?: string;
    actionTaken?: string;
  }> {
    return await this.validateMCPAccessToken(token);
  }

  /**
   * Generate MCP authorization code for session binding
   */
  async generateMCPAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge?: string,
    scope?: string,
  ): Promise<string> {
    return await this.tokenManager.generateAuthorizationCode(
      clientId,
      userId,
      redirectUri,
      codeChallenge,
      scope,
    );
  }

  /**
   * Exchange MCP authorization code for tokens
   */
  async exchangeMCPAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<{ success: boolean; error?: string; accessToken?: any }> {
    // Get the authorization code data BEFORE exchange (which deletes it)
    const authCode = await this.tokenManager.getAuthorizationCode(code);
    if (!authCode) {
      return { success: false, error: 'Authorization code not found' };
    }

    const exchangeResult = await this.authorizationHandler.exchangeAuthorizationCode(
      code,
      clientId,
      redirectUri,
      codeVerifier,
    );

    if (!exchangeResult.success) {
      return { success: false, error: exchangeResult.error || 'Exchange failed' };
    }

    // Generate access token using the user ID and scope from the auth code
    const accessToken = await this.tokenManager.generateAccessToken(
      clientId,
      authCode.user_id,
      true, // Include refresh token
      authCode.scope, // Use scope from authorization code
    );

    return {
      success: true,
      accessToken,
    };
  }

  /**
   * Get token mapping for debugging/monitoring
   */
  async getTokenMapping(mcpToken: string): Promise<TokenMapping> {
    try {
      const validation = await this.tokenManager.validateAccessToken(mcpToken);

      if (!validation.valid) {
        return {
          mcpToken: null,
          externalTokenExists: false,
        };
      }

      // Check if third-party credentials exist
      const thirdPartyCredentials = await this.credentialStore.getCredentials(
        validation.userId!,
        'example', // Provider ID
      );

      return {
        mcpToken: {
          client_id: validation.clientId!,
          user_id: validation.userId!,
          scope: validation.scopes?.join(' ') || '',
          expires_at: 0, // Would need to get from token data
          created_at: 0, // Would need to get from token data
        },
        externalTokenExists: !!thirdPartyCredentials,
      };
    } catch (error) {
      this.logger?.error('OAuthProvider: Failed to get token mapping:', toError(error));
      return {
        mcpToken: null,
        externalTokenExists: false,
      };
    }
  }

  /**
   * Handle authorization code grant
   */
  private async handleAuthorizationCodeGrant(request: TokenRequest): Promise<TokenResponse> {
    if (!request.code || !request.redirect_uri) {
      throw new Error('Missing required parameters for authorization_code grant');
    }

    // Get authorization code data BEFORE exchange (which deletes it)
    const authCode = await this.tokenManager.getAuthorizationCode(request.code);
    if (!authCode) {
      throw new Error('Authorization code not found');
    }

    // Validate authorization code and exchange for tokens
    const exchangeResult = await this.authorizationHandler.exchangeAuthorizationCode(
      request.code,
      request.client_id,
      request.redirect_uri,
      request.code_verifier,
    );

    if (!exchangeResult.success) {
      throw new Error(exchangeResult.error || 'Authorization code exchange failed');
    }

    // Generate access token using the user ID and scope from the auth code
    const accessToken = await this.tokenManager.generateAccessToken(
      request.client_id,
      authCode.user_id,
      true, // Include refresh token
      authCode.scope, // Use scope from authorization code
    );

    return {
      access_token: accessToken.access_token,
      token_type: 'Bearer',
      expires_in: Math.floor((accessToken.expires_at - Date.now()) / 1000),
      ...(accessToken.refresh_token && { refresh_token: accessToken.refresh_token }),
      scope: accessToken.scope,
    };
  }

  /**
   * Handle refresh token grant
   */
  private async handleRefreshTokenGrant(request: TokenRequest): Promise<TokenResponse> {
    if (!request.refresh_token) {
      throw new Error('Missing refresh_token for refresh_token grant');
    }

    const refreshResult = await this.tokenManager.refreshAccessToken(
      request.refresh_token,
      request.client_id,
    );

    if (!refreshResult.success || !refreshResult.accessToken) {
      throw new Error(refreshResult.error || 'Token refresh failed');
    }

    const accessToken = refreshResult.accessToken;

    return {
      access_token: accessToken.access_token,
      token_type: 'Bearer',
      expires_in: Math.floor((accessToken.expires_at - Date.now()) / 1000),
      ...(accessToken.refresh_token && { refresh_token: accessToken.refresh_token }),
      scope: accessToken.scope,
    };
  }
}
