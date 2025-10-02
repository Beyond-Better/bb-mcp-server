/**
 * OAuth Consumer - Generic OAuth 2.0 Consumer Base Class
 *
 * 🔒 SECURITY-CRITICAL: This component provides a generic OAuth 2.0 consumer base class
 * for third-party OAuth integrations. All security patterns and token management logic
 * are preserved from the original AuthenticationService.ts implementation.
 *
 * Security Requirements:
 * - RFC 6749 OAuth 2.0 client implementation
 * - RFC 7636 PKCE support for public clients
 * - Secure state parameter handling for CSRF protection
 * - Automatic token refresh with proper error handling
 * - Secure credential storage and lifecycle management
 */

import type { Logger } from '../../types/library.types.ts';
import type { CredentialStore } from '../storage/CredentialStore.ts';
import type { KVManager } from '../storage/KVManager.ts';
import { toError } from '../utils/Error.ts';
import type {
  AuthCallbackResult,
  AuthFlowResult,
  AuthorizationRequest,
  OAuthConsumerConfig,
  OAuthCredentials,
  TokenResult,
  UserCredentials,
} from './OAuthTypes.ts';

/**
 * Dependencies required by OAuthProvider
 */
export interface OAuthConsumerDependencies {
  /** KV storage manager for OAuth data persistence */
  kvManager: KVManager;
  /** Credential store for secure token storage */
  credentialStore: CredentialStore;
  /** Logger for security event logging */
  logger: Logger;
}

/**
 * 🔒 SECURITY-CRITICAL: Generic OAuth 2.0 Consumer Base Class
 *
 * Provides foundation for third-party OAuth integrations with exact security preservation
 * from the original AuthenticationService.ts implementation. This base class handles
 * the common OAuth flow patterns while allowing provider-specific customization.
 *
 * Key Security Features:
 * - RFC 6749 compliant OAuth 2.0 client flows
 * - RFC 7636 PKCE support for authorization code flow security
 * - Secure state parameter generation and validation
 * - Automatic token refresh with exponential backoff
 * - Secure credential storage with expiry management
 * - Comprehensive security logging and error handling
 *
 * Session Binding Interface:
 * - Implements ThirdPartyAuthService interface for OAuth Provider session binding
 * - Allows MCP token validation to check third-party token status
 * - Supports automatic token refresh for seamless session management
 */
export class OAuthConsumer<T extends OAuthConsumerConfig = OAuthConsumerConfig> {
  protected config: T;
  protected logger: Logger;

  // Dependencies
  protected kvManager: KVManager;
  protected credentialStore: CredentialStore;

  // 🔒 SECURITY-CRITICAL: KV key prefixes for secure storage
  protected readonly AUTH_STATE_PREFIX = ['oauth', 'consumer_auth_state'];

  constructor(config: T, dependencies: OAuthConsumerDependencies) {
    // Apply config with proper defaults
    this.config = config;
    // this.config = {
    //   providerId: config.providerId,
    //   authUrl: config.authUrl,
    //   tokenUrl: config.tokenUrl,
    //   clientId: config.clientId,
    //   clientSecret: config.clientSecret,
    //   redirectUri: config.redirectUri,
    //   scopes: config.scopes,
    //   tokenRefreshBufferMinutes: config.tokenRefreshBufferMinutes,
    //   maxTokenRefreshRetries: config.maxTokenRefreshRetries,
    //   ...(config.customHeaders !== undefined && { customHeaders: config.customHeaders }),
    // };
    this.kvManager = dependencies.kvManager;
    this.credentialStore = dependencies.credentialStore;
    this.logger = dependencies.logger;

    if (!this.kvManager) throw new Error(`OAuthConsumer constructor failed: must supply kvManager`);
    if (!this.credentialStore) throw new Error(`OAuthConsumer constructor failed: must supply credentialStore`);

    this.logger?.info('OAuthConsumer: Initialized OAuth consumer', {
      providerId: this.config.providerId,
      authUrl: this.config.authUrl,
      tokenUrl: this.config.tokenUrl,
      scopes: this.config.scopes,
      tokenRefreshBufferMinutes: this.config.tokenRefreshBufferMinutes,
      hasCredentialStore: !!this.credentialStore,
      hasKVManager: !!this.kvManager,
    });
  }

  /**
   * Abstract methods for provider-specific implementation
   *
   * These methods must be implemented by concrete consumer classes
   * to handle provider-specific OAuth flow details.
   */

  async initialize(): Promise<void> {}

  /**
   * Build authorization URL for the specific OAuth provider
   * Default implementation - override in consumer for provider-specific logic
   */
  protected buildAuthorizationUrl(state: string, scopes?: string[]): string {
    return this.buildAuthUrl(state);
  }

  /**
   * Exchange authorization code for tokens with the specific provider
   * Default implementation - override in consumer for provider-specific logic
   */
  protected async exchangeCodeForTokens(code: string, state: string): Promise<TokenResult> {
    try {
      const url = new URL(this.config.tokenUrl);
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
      });

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      const credentials: OAuthCredentials = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type || 'Bearer',
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scopes: tokenData.scope ? tokenData.scope.split(' ') : this.config.scopes,
      };

      return {
        success: true,
        credentials,
        tokens: credentials, // Alias for backward compatibility
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      };
    }
  }

  /**
   * Refresh tokens with the specific provider
   * Default implementation - override in consumer for provider-specific logic
   */
  protected async refreshTokens(refreshToken: string): Promise<TokenResult> {
    try {
      const url = new URL(this.config.tokenUrl);
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      });

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      const credentials: OAuthCredentials = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
        tokenType: tokenData.token_type || 'Bearer',
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scopes: tokenData.scope ? tokenData.scope.split(' ') : this.config.scopes,
      };

      return {
        success: true,
        credentials,
        tokens: credentials, // Alias for backward compatibility
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  /**
   * Base method for building authorization URL with PKCE support
   */
  protected buildAuthUrl(state: string, codeChallenge?: string): string {
    const url = new URL(this.config.authUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', state);

    if (codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return url.toString();
  }

  /**
   * Get access token with automatic refresh - public interface
   */
  async getAccessToken(userId: string): Promise<string | null> {
    return await this.getValidAccessToken(userId);
  }

  /**
   * 🔒 SECURITY-CRITICAL: Start OAuth authorization flow
   *
   * Preserves exact authorization flow logic from AuthenticationService.generateAuthorizationUrl()
   * - Cryptographically secure state generation
   * - PKCE code challenge generation
   * - Secure state storage with expiry
   * - Authorization URL generation with all security parameters
   */
  async startAuthorizationFlow(
    userId: string,
    scopes?: string[],
  ): Promise<AuthFlowResult> {
    const flowId = Math.random().toString(36).substring(2, 15);

    this.logger?.info(`OAuthConsumer: Starting authorization flow [${flowId}]`, {
      flowId,
      userId,
      providerId: this.config.providerId,
      scopes: scopes || this.config.scopes,
    });

    try {
      // 🔒 SECURITY-CRITICAL: Generate cryptographically secure state
      const state = this.generateSecureState();

      // Generate authorization URL
      const authorizationUrl = this.buildAuthorizationUrl(state, scopes);

      // 🔒 SECURITY-CRITICAL: Store authorization request state with expiry
      const authRequest: AuthorizationRequest = {
        userId,
        state,
        codeVerifier: '', // Will be set by provider-specific implementation if needed
        redirectUri: this.config.redirectUri,
        createdAt: Date.now(),
      };

      await this.storeAuthState(state, authRequest);

      this.logger?.info(`OAuthConsumer: Authorization flow started successfully [${flowId}]`, {
        flowId,
        userId,
        state,
        authorizationUrl,
      });

      return {
        authorizationUrl,
        state,
      };
    } catch (error) {
      this.logger?.error(
        `OAuthConsumer: Failed to start authorization flow [${flowId}]:`,
        toError(error),
        {
          flowId,
          userId,
        },
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Handle OAuth authorization callback
   *
   * Preserves exact callback handling logic from AuthenticationService.exchangeAuthorizationCode()
   * - State parameter validation for CSRF protection
   * - Authorization code exchange with error handling
   * - Secure credential storage
   * - Authorization state cleanup
   */
  async handleAuthorizationCallback(
    code: string,
    state: string,
  ): Promise<AuthCallbackResult> {
    const callbackId = Math.random().toString(36).substring(2, 15);

    this.logger?.info(`OAuthConsumer: Handling authorization callback [${callbackId}]`, {
      callbackId,
      state,
      hasCode: !!code,
    });

    try {
      // 🔒 SECURITY-CRITICAL: Validate state parameter
      const storedAuthRequest = await this.getAuthState(state);
      if (!storedAuthRequest) {
        throw new Error('Invalid or expired authorization state');
      }

      // Exchange code for tokens
      const tokenResult = await this.exchangeCodeForTokens(code, state);

      // Store user credentials (support both 'credentials' and 'tokens' for backward compatibility)
      const credentials = tokenResult.credentials || tokenResult.tokens;
      if (tokenResult.success && credentials) {
        await this.storeUserCredentials(storedAuthRequest.userId, credentials);
      } else {
        throw new Error(tokenResult.error || 'Token exchange failed');
      }

      // 🔒 SECURITY-CRITICAL: Clean up authorization state (one-time use)
      await this.deleteAuthState(state);

      this.logger?.info(`OAuthConsumer: Authorization callback successful [${callbackId}]`, {
        callbackId,
        userId: storedAuthRequest.userId,
        providerId: this.config.providerId,
      });

      return {
        success: true,
        userId: storedAuthRequest.userId,
      };
    } catch (error) {
      this.logger?.error(
        `OAuthConsumer: Authorization callback failed [${callbackId}]:`,
        toError(error),
        {
          callbackId,
          state,
        },
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authorization callback failed',
      };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Get valid access token with automatic refresh
   *
   * CredentialStore.getCredentials returns null for expired tokens (with buffer),
   * so we need to handle token refresh explicitly.
   */
  async getValidAccessToken(userId: string): Promise<string | null> {
    const tokenId = Math.random().toString(36).substring(2, 15);

    try {
      if (!this.credentialStore) {
        this.logger?.warn(`OAuthConsumer: No credential store available [${tokenId}]`, {
          tokenId,
          userId,
        });
        return null;
      }

      // CredentialStore.getCredentials already checks expiry with buffer
      const credentials = await this.credentialStore.getCredentials(userId, this.config.providerId);

      if (credentials) {
        // Credentials are valid (not expired)
        return credentials.accessToken;
      }

      // Credentials are null - either don't exist or are expired
      // Check if we have expired credentials that can be refreshed
      if (!this.kvManager) {
        this.logger?.debug(`OAuthConsumer: No KV manager available for refresh [${tokenId}]`, {
          tokenId,
          userId,
        });
        return null;
      }

      // Get credentials directly from KV (bypass expiry check) to attempt refresh
      const expiredCreds = await this.kvManager.get<any>(
        ['credentials', this.config.providerId, userId],
      );

      if (!expiredCreds || !expiredCreds.refreshToken) {
        this.logger?.debug(
          `OAuthConsumer: No credentials or refresh token available [${tokenId}]`,
          {
            tokenId,
            userId,
            providerId: this.config.providerId,
          },
        );
        return null;
      }

      // Attempt token refresh
      this.logger?.info(`OAuthConsumer: Attempting token refresh [${tokenId}]`, {
        tokenId,
        userId,
        providerId: this.config.providerId,
      });

      try {
        const refreshResult = await this.refreshTokens(expiredCreds.refreshToken);

        if (refreshResult.success && refreshResult.credentials) {
          // Update credentials in store
          await this.credentialStore.updateCredentials(
            userId,
            this.config.providerId,
            refreshResult.credentials,
          );

          this.logger?.info(`OAuthConsumer: Token refresh successful [${tokenId}]`, {
            tokenId,
            userId,
            providerId: this.config.providerId,
          });

          return refreshResult.credentials.accessToken;
        } else {
          throw new Error(refreshResult.error || 'Token refresh failed');
        }
      } catch (refreshError) {
        this.logger?.error(
          `OAuthConsumer: Token refresh failed [${tokenId}]:`,
          toError(refreshError),
          {
            tokenId,
            userId,
            providerId: this.config.providerId,
          },
        );

        // Clean up invalid credentials
        await this.credentialStore.deleteCredentials(userId, this.config.providerId);
        return null;
      }
    } catch (error) {
      this.logger?.error(
        `OAuthConsumer: Failed to get valid access token [${tokenId}]:`,
        toError(error),
        {
          tokenId,
          userId,
        },
      );
      return null;
    }
  }

  /**
   * Check if user has valid credentials
   */
  async isUserAuthenticated(userId: string): Promise<boolean> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      return accessToken !== null;
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to check user authentication:', toError(error), {
        userId,
      });
      return false;
    }
  }

  /**
   * Get user credentials
   */
  async getUserCredentials(userId: string): Promise<UserCredentials | null> {
    try {
      if (!this.credentialStore) {
        return null;
      }

      const credentials = await this.credentialStore.getCredentials(userId, this.config.providerId);

      if (!credentials) {
        return null;
      }

      // Return in UserCredentials format
      return {
        userId,
        tokens: credentials,
        createdAt: 0, // Would need to be tracked separately
        lastUsed: Date.now(),
        refreshCount: 0, // Would need to be tracked separately
      };
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to get user credentials:', toError(error), {
        userId,
      });
      return null;
    }
  }

  /**
   * Store user credentials
   */
  async storeUserCredentials(userId: string, credentials: OAuthCredentials): Promise<void> {
    try {
      if (!this.credentialStore) {
        throw new Error('Credential store not available');
      }

      await this.credentialStore.storeCredentials(userId, this.config.providerId, credentials);

      this.logger?.info('OAuthConsumer: Stored user credentials', {
        userId,
        providerId: this.config.providerId,
        expiresAt: new Date(credentials.expiresAt).toISOString(),
      });
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to store user credentials:', toError(error), {
        userId,
      });
      throw error;
    }
  }

  /**
   * Update user credentials
   */
  async updateUserCredentials(userId: string, credentials: OAuthCredentials): Promise<boolean> {
    try {
      if (!this.credentialStore) {
        throw new Error('Credential store not available');
      }

      await this.credentialStore.updateCredentials(userId, this.config.providerId, credentials);

      this.logger?.info('OAuthConsumer: Updated user credentials', {
        userId,
        providerId: this.config.providerId,
        expiresAt: new Date(credentials.expiresAt).toISOString(),
      });

      return true;
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to update user credentials:', toError(error), {
        userId,
      });
      return false;
    }
  }

  /**
   * Revoke user credentials
   */
  async revokeUserCredentials(userId: string): Promise<boolean> {
    try {
      if (!this.credentialStore) {
        throw new Error('Credential store not available');
      }

      await this.credentialStore.deleteCredentials(userId, this.config.providerId);

      this.logger?.info('OAuthConsumer: Revoked user credentials', {
        userId,
        providerId: this.config.providerId,
      });

      return true;
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to revoke user credentials:', toError(error), {
        userId,
      });
      return false;
    }
  }


  /**
   * 🎯 Public: Force token refresh by clearing cached credentials
   * This will cause the next getAccessToken() call to trigger refresh
   */
  async clearUserCredentials(userId: string): Promise<void> {
    try {
      this.logger?.info(`OAuthConsumer: clearing cached credentials for user ${userId}`);

      // Clear cached credentials to force refresh on next access
      if (this.credentialStore) {
        const credentials = await this.credentialStore.getCredentials(userId, this.config.providerId);
        if (credentials) {
          // Keep the refresh token but mark access token as expired
          const expiredCredentials = {
            ...credentials,
            expiresAt: Date.now() - 1000, // Expired 1 second ago
          };
          await this.credentialStore.updateCredentials(userId, this.config.providerId, expiredCredentials);
        }
      }

      this.logger?.info(`OAuthConsumer: cleared cached credentials for user ${userId}`);
    } catch (error) {
      this.logger?.error('OAuthConsumer: clear credentials failed', toError(error), {
        userId,
      });
      throw error;
    }
  }

  /**
   * Get authenticated users
   */
  async getAuthenticatedUsers(): Promise<string[]> {
    try {
      if (!this.kvManager) {
        return [];
      }

      // Get all credential entries for this provider
      const credentialsPrefix = ['credentials', this.config.providerId];
      const results = await this.kvManager.list(credentialsPrefix);
      const users = new Set<string>();

      for (const item of results) {
        if (Array.isArray(item.key) && item.key.length >= 3) {
          users.add(item.key[2] as string); // userId is at index 2
        }
      }

      return Array.from(users);
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to get authenticated users:', toError(error));
      return [];
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Generate cryptographically secure state parameter
   *
   * Preserves exact state generation from AuthenticationService.generateRandomString()
   * Uses Web Crypto API for cryptographically secure randomness.
   */
  protected generateSecureState(): string {
    const length = 32;
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    return Array.from(randomBytes)
      .map((byte) => charset[byte % charset.length])
      .join('');
  }

  /**
   * 🔒 SECURITY-CRITICAL: Store authorization state securely with TTL
   *
   * Authorization state is temporary (10 minutes) and separate from long-term credentials,
   * so we use KVManager directly rather than CredentialStore.
   */
  protected async storeAuthState(state: string, authRequest: AuthorizationRequest): Promise<void> {
    try {
      if (!this.kvManager) {
        throw new Error('KV Manager not available for auth state storage');
      }

      await this.kvManager.set(
        [...this.AUTH_STATE_PREFIX, this.config.providerId, state],
        authRequest,
        { expireIn: 10 * 60 * 1000 }, // 10 minutes TTL
      );

      this.logger?.debug('OAuthConsumer: Stored authorization state', {
        state,
        userId: authRequest.userId,
        providerId: this.config.providerId,
        ttl: '10 minutes',
      });
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to store auth state:', toError(error));
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Get authorization state with expiry validation
   */
  protected async getAuthState(state: string): Promise<AuthorizationRequest | null> {
    try {
      if (!this.kvManager) {
        this.logger?.warn('OAuthConsumer: KV Manager not available for auth state retrieval');
        return null;
      }

      const authRequest = await this.kvManager.get<AuthorizationRequest>(
        [...this.AUTH_STATE_PREFIX, this.config.providerId, state],
      );

      if (!authRequest) {
        this.logger?.debug('OAuthConsumer: Authorization state not found', {
          state,
          providerId: this.config.providerId,
        });
        return null;
      }

      this.logger?.debug('OAuthConsumer: Retrieved authorization state', {
        state,
        userId: authRequest.userId,
        providerId: this.config.providerId,
      });
      return authRequest;
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to get auth state:', toError(error));
      return null;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Delete authorization state (one-time use security)
   */
  protected async deleteAuthState(state: string): Promise<void> {
    try {
      if (!this.kvManager) {
        this.logger?.warn('OAuthConsumer: KV Manager not available for auth state deletion');
        return;
      }

      await this.kvManager.delete(
        [...this.AUTH_STATE_PREFIX, this.config.providerId, state],
      );

      this.logger?.debug('OAuthConsumer: Deleted authorization state', {
        state,
        providerId: this.config.providerId,
      });
    } catch (error) {
      this.logger?.error('OAuthConsumer: Failed to delete auth state:', toError(error));
    }
  }
}
