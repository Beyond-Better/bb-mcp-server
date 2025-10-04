/**
 * Token Manager - OAuth 2.0 Token Operations with Security Preservation
 *
 * 🔒 SECURITY-CRITICAL: This component handles all OAuth token generation, validation,
 * and lifecycle management. All cryptographic operations are preserved exactly from
 * the original OAuthClientService.ts implementation to maintain security posture.
 *
 * Security Requirements:
 * - RFC 6749 compliant token generation and validation
 * - Cryptographically secure random generation using Web Crypto API
 * - Secure token storage with automatic expiry via Deno KV
 * - Token rotation security for refresh tokens
 * - Proper token lifecycle management
 */

import type { Logger } from '../../types/library.types.ts';
import type { KVManager } from '../storage/KVManager.ts';
import { toError } from '../utils/Error.ts';

/**
 * Token configuration for the TokenManager
 */
export interface TokenConfig {
  /** Access token expiry in milliseconds (default: 3600000 = 1 hour) */
  accessTokenExpiryMs: number;
  /** Refresh token expiry in milliseconds (default: 2592000000 = 30 days) */
  refreshTokenExpiryMs: number;
  /** Authorization code expiry in milliseconds (default: 600000 = 10 minutes) */
  authorizationCodeExpiryMs: number;
}

/**
 * MCP Access Token structure - preserves exact format from OAuthClientService.ts
 */
export interface MCPAccessToken {
  /** Generated MCP access token */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: string;
  /** MCP client ID */
  client_id: string;
  /** User ID that links to external tokens */
  user_id: string;
  /** Token scope */
  scope: string;
  /** Token creation timestamp */
  created_at: number;
  /** Token expiration timestamp */
  expires_at: number;
  /** Optional refresh token */
  refresh_token?: string;
}

/**
 * MCP Refresh Token structure - preserves exact format from OAuthClientService.ts
 */
export interface MCPRefreshToken {
  /** Generated MCP refresh token */
  refresh_token: string;
  /** MCP client ID */
  client_id: string;
  /** User ID that links to external tokens */
  user_id: string;
  /** Token scope */
  scope: string;
  /** Token creation timestamp */
  created_at: number;
  /** Token expiration timestamp */
  expires_at: number;
}

/**
 * MCP Authorization Code structure - preserves exact format from OAuthClientService.ts
 */
export interface MCPAuthorizationCode {
  /** Generated MCP authorization code */
  code: string;
  /** MCP client ID */
  client_id: string;
  /** User ID that links to external tokens */
  user_id: string;
  /** Validated redirect URI */
  redirect_uri: string;
  /** Authorized scope */
  scope: string;
  /** PKCE code challenge for verification */
  code_challenge?: string;
  /** Code creation timestamp */
  created_at: number;
  /** Code expiration timestamp */
  expires_at: number;
}

/**
 * Token validation result
 */
export interface TokenValidation {
  /** Whether the token is valid */
  valid: boolean;
  /** Client ID associated with the token */
  clientId?: string;
  /** User ID associated with the token */
  userId?: string;
  /** Token scope array */
  scopes?: string[];
  /** Error message if validation failed */
  error?: string;
  /** Specific error code for OAuth compliance */
  errorCode?: 'invalid_token' | 'token_expired' | 'insufficient_scope';
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  /** Whether the refresh was successful */
  success: boolean;
  /** New access token if successful */
  accessToken?: MCPAccessToken;
  /** Error message if failed */
  error?: string;
}

/**
 * Dependencies required by TokenManager
 */
export interface TokenManagerDependencies {
  /** KV storage manager for token persistence */
  kvManager: KVManager;
  /** Logger for security event logging */
  logger?: Logger | undefined;
}

/**
 * 🔒 SECURITY-CRITICAL: OAuth 2.0 Token Manager
 *
 * Handles all token generation, validation, and lifecycle management with
 * security preservation from the original OAuthClientService.ts implementation.
 *
 * Key Security Features:
 * - Cryptographically secure token generation using crypto.getRandomValues()
 * - RFC 6749 compliant token formats and expiry handling
 * - Automatic token cleanup via Deno KV expiry
 * - Token rotation security for refresh tokens
 * - Comprehensive security logging for audit trails
 */
export class TokenManager {
  private kvManager: KVManager;
  private logger: Logger | undefined;
  private config: TokenConfig;

  // 🔒 SECURITY-CRITICAL: KV key prefixes - preserves exact structure from OAuthClientService.ts
  private readonly MCP_ACCESS_TOKENS_PREFIX = ['oauth', 'mcp_access_tokens'];
  private readonly MCP_REFRESH_TOKENS_PREFIX = ['oauth', 'mcp_refresh_tokens'];
  private readonly MCP_AUTH_CODES_PREFIX = ['oauth', 'mcp_auth_codes'];

  constructor(config: TokenConfig, dependencies: TokenManagerDependencies) {
    this.kvManager = dependencies.kvManager;
    this.logger = dependencies.logger;
    // Apply defaults for missing values
    this.config = {
      accessTokenExpiryMs: config.accessTokenExpiryMs ?? 3600 * 1000, // 1 hour
      refreshTokenExpiryMs: config.refreshTokenExpiryMs ?? 30 * 24 * 3600 * 1000, // 30 days
      authorizationCodeExpiryMs: config.authorizationCodeExpiryMs ?? 10 * 60 * 1000, // 10 minutes
    };

    this.logger?.info('TokenManager: Initialized', {
      accessTokenExpiryMs: this.config.accessTokenExpiryMs,
      refreshTokenExpiryMs: this.config.refreshTokenExpiryMs,
      authorizationCodeExpiryMs: this.config.authorizationCodeExpiryMs,
    });
  }

  /**
   * 🔒 SECURITY-CRITICAL: Generate MCP access token with optional refresh token
   *
   * Preserves exact token generation logic from OAuthClientService.generateMCPAccessToken()
   * - Cryptographically secure token generation
   * - Proper expiry timestamp calculation
   * - Refresh token rotation when requested
   * - Secure KV storage with automatic expiry
   */
  async generateAccessToken(
    clientId: string,
    userId: string,
    includeRefreshToken: boolean = true,
    scope: string = 'read write',
  ): Promise<MCPAccessToken> {
    const tokenGenId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`TokenManager: Generating access token [${tokenGenId}]`, {
    //   tokenGenId,
    //   clientId,
    //   userId,
    //   includeRefreshToken,
    // });

    try {
      // 🔒 SECURITY-CRITICAL: Exact token format preservation from OAuthClientService.ts
      const accessToken = 'mcp_token_' + this.generateRandomString(32);
      const now = Date.now();

      const tokenData: MCPAccessToken = {
        access_token: accessToken,
        token_type: 'Bearer',
        client_id: clientId,
        user_id: userId,
        scope: scope,
        created_at: now,
        expires_at: now + this.config.accessTokenExpiryMs,
      };

      // Generate refresh token if requested (preserves exact logic)
      if (includeRefreshToken) {
        const refreshToken = 'mcp_refresh_' + this.generateRandomString(32);
        tokenData.refresh_token = refreshToken;

        // Store refresh token with longer expiration (30 days)
        const refreshTokenData: MCPRefreshToken = {
          refresh_token: refreshToken,
          client_id: clientId,
          user_id: userId,
          scope: scope,
          created_at: now,
          expires_at: now + this.config.refreshTokenExpiryMs,
        };

        await this.kvManager.set(
          [...this.MCP_REFRESH_TOKENS_PREFIX, refreshToken],
          refreshTokenData,
          { expireIn: this.config.refreshTokenExpiryMs },
        );

        this.logger?.debug(`TokenManager: Generated refresh token [${tokenGenId}]`, {
          tokenGenId,
          clientId,
          userId,
          refreshTokenLength: refreshToken.length,
          refreshExpiresAt: new Date(refreshTokenData.expires_at).toISOString(),
        });
      }

      // 🔒 SECURITY-CRITICAL: Store access token with automatic expiry
      await this.kvManager.set(
        [...this.MCP_ACCESS_TOKENS_PREFIX, accessToken],
        tokenData,
        { expireIn: this.config.accessTokenExpiryMs },
      );

      // this.logger?.info(`TokenManager: Generated access token successfully [${tokenGenId}]`, {
      //   tokenGenId,
      //   clientId,
      //   userId,
      //   tokenLength: accessToken.length,
      //   expiresAt: new Date(tokenData.expires_at).toISOString(),
      //   hasRefreshToken: !!tokenData.refresh_token,
      // });

      return tokenData;
    } catch (error) {
      this.logger?.error(
        `TokenManager: Failed to generate access token [${tokenGenId}]:`,
        toError(error),
        {
          tokenGenId,
          clientId,
          userId,
        },
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Generate MCP authorization code with PKCE support
   *
   * Preserves exact authorization code generation logic from OAuthClientService.generateMCPAuthorizationCode()
   * - Cryptographically secure code generation
   * - 10-minute expiry for security
   * - PKCE code challenge storage for verification
   * - Secure KV storage with automatic cleanup
   */
  async generateAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge?: string,
    scope?: string,
  ): Promise<string> {
    const codeGenId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`TokenManager: Generating authorization code [${codeGenId}]`, {
    //   codeGenId,
    //   clientId,
    //   userId,
    //   redirectUri,
    //   hasCodeChallenge: !!codeChallenge,
    //   challengePrefix: codeChallenge ? codeChallenge.substring(0, 12) + '...' : undefined,
    // });

    try {
      // 🔒 SECURITY-CRITICAL: Exact code format preservation from OAuthClientService.ts
      const code = 'mcp_auth_' + this.generateRandomString(32);
      const now = Date.now();
      const expiresAt = now + this.config.authorizationCodeExpiryMs;

      const authCode: MCPAuthorizationCode = {
        code,
        client_id: clientId,
        user_id: userId,
        redirect_uri: redirectUri,
        scope: scope || 'read write',
        created_at: now,
        expires_at: expiresAt,
        ...(codeChallenge && { code_challenge: codeChallenge }),
      };

      const kvKey = [...this.MCP_AUTH_CODES_PREFIX, code];

      this.logger?.debug(`TokenManager: Storing authorization code [${codeGenId}]`, {
        codeGenId,
        kvKey,
        codePrefix: code.substring(0, 12) + '...',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        ttlMs: this.config.authorizationCodeExpiryMs,
      });

      // 🔒 SECURITY-CRITICAL: Store with automatic expiry (10 minutes)
      await this.kvManager.set(
        kvKey,
        authCode,
        { expireIn: this.config.authorizationCodeExpiryMs },
      );

      // Verify the code was stored successfully
      const verifyResult = await this.kvManager.get(kvKey);
      if (!verifyResult) {
        this.logger?.error(
          `TokenManager: Failed to verify code storage [${codeGenId}]`,
          undefined,
          {
            codeGenId,
            kvKey,
          },
        );
        throw new Error('Failed to store authorization code');
      }

      // this.logger?.info(`TokenManager: Generated authorization code successfully [${codeGenId}]`, {
      //   codeGenId,
      //   clientId,
      //   userId,
      //   codePrefix: code.substring(0, 12) + '...',
      //   codeLength: code.length,
      //   expiresIn: '10 minutes',
      //   verified: true,
      // });

      return code;
    } catch (error) {
      this.logger?.error(
        `TokenManager: Failed to generate authorization code [${codeGenId}]:`,
        toError(error),
        {
          codeGenId,
          clientId,
          userId,
        },
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Validate MCP access token
   *
   * Preserves exact validation logic from OAuthClientService.validateMCPAccessToken()
   * - Token existence and expiry validation
   * - Automatic cleanup of expired tokens
   * - Comprehensive security logging
   */
  async validateAccessToken(accessToken: string): Promise<TokenValidation> {
    const validationId = Math.random().toString(36).substring(2, 15);

    try {
      // 1. Check if MCP token exists
      const result = await this.kvManager.get<MCPAccessToken>([
        ...this.MCP_ACCESS_TOKENS_PREFIX,
        accessToken,
      ]);

      if (!result) {
        this.logger?.warn(`TokenManager: Access token not found [${validationId}]`, {
          validationId,
          tokenPrefix: accessToken.substring(0, 12) + '...',
        });
        return {
          valid: false,
          error: 'Invalid access token',
          errorCode: 'invalid_token',
        };
      }

      const token = result;
      const now = Date.now();

      // 2. Check if token has expired
      if (token.expires_at < now) {
        this.logger?.warn(`TokenManager: Access token expired [${validationId}]`, {
          validationId,
          tokenPrefix: accessToken.substring(0, 12) + '...',
          expiresAt: new Date(token.expires_at).toISOString(),
          expiredBy: now - token.expires_at,
        });

        // Clean up expired token
        await this.kvManager.delete([...this.MCP_ACCESS_TOKENS_PREFIX, accessToken]);
        return {
          valid: false,
          error: 'Access token expired',
          errorCode: 'token_expired',
        };
      }

      // 3. Token is valid
      const scopes = token.scope ? token.scope.split(' ') : ['read', 'write'];

      return {
        valid: true,
        clientId: token.client_id,
        userId: token.user_id,
        scopes,
      };
    } catch (error) {
      this.logger?.error(
        `TokenManager: Failed to validate access token [${validationId}]:`,
        toError(error),
        {
          validationId,
          tokenPrefix: accessToken.substring(0, 12) + '...',
        },
      );
      return {
        valid: false,
        error: 'Token validation failed',
        errorCode: 'invalid_token',
      };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Get and validate authorization code
   *
   * Preserves exact code retrieval logic from OAuthClientService.exchangeMCPAuthorizationCode()
   * - Code existence and expiry validation
   * - PKCE challenge preservation for verification
   * - One-time use enforcement via automatic deletion
   */
  async getAuthorizationCode(code: string): Promise<MCPAuthorizationCode | null> {
    const lookupId = Math.random().toString(36).substring(2, 15);

    this.logger?.debug(`TokenManager: Looking up authorization code [${lookupId}]`, {
      lookupId,
      codePrefix: code.substring(0, 12) + '...',
      keyPath: [...this.MCP_AUTH_CODES_PREFIX, code],
    });

    try {
      const result = await this.kvManager.get<MCPAuthorizationCode>([
        ...this.MCP_AUTH_CODES_PREFIX,
        code,
      ]);

      if (!result) {
        this.logger?.warn(`TokenManager: Authorization code not found [${lookupId}]`, {
          lookupId,
          codePrefix: code.substring(0, 12) + '...',
        });
        return null;
      }

      const authCode = result;
      const now = Date.now();

      // Check if code has expired
      if (authCode.expires_at < now) {
        this.logger?.error(`TokenManager: Authorization code expired [${lookupId}]`, undefined, {
          lookupId,
          expiresAt: new Date(authCode.expires_at).toISOString(),
          now: new Date(now).toISOString(),
          expiredBy: now - authCode.expires_at,
        });

        // Clean up expired code
        await this.kvManager.delete([...this.MCP_AUTH_CODES_PREFIX, code]);
        return null;
      }

      this.logger?.debug(`TokenManager: Authorization code found and valid [${lookupId}]`, {
        lookupId,
        clientId: authCode.client_id,
        userId: authCode.user_id,
        hasCodeChallenge: !!authCode.code_challenge,
      });

      return authCode;
    } catch (error) {
      this.logger?.error(
        `TokenManager: Failed to get authorization code [${lookupId}]:`,
        toError(error),
        {
          lookupId,
          codePrefix: code.substring(0, 12) + '...',
        },
      );
      return null;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Delete authorization code after use
   *
   * Ensures one-time use security for authorization codes
   */
  async deleteAuthorizationCode(code: string): Promise<void> {
    try {
      await this.kvManager.delete([...this.MCP_AUTH_CODES_PREFIX, code]);

      this.logger?.debug('TokenManager: Deleted authorization code', {
        codePrefix: code.substring(0, 12) + '...',
      });
    } catch (error) {
      this.logger?.error('TokenManager: Failed to delete authorization code:', toError(error), {
        codePrefix: code.substring(0, 12) + '...',
      });
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Exchange refresh token for new access token
   *
   * Preserves exact refresh logic from OAuthClientService.exchangeRefreshToken()
   * - Refresh token validation and expiry checking
   * - New access token generation with new refresh token
   * - Token rotation security (old refresh token invalidation)
   */
  async refreshAccessToken(refreshToken: string, clientId: string): Promise<TokenRefreshResult> {
    const exchangeId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`TokenManager: Starting refresh token exchange [${exchangeId}]`, {
    //   exchangeId,
    //   refreshTokenPrefix: refreshToken.substring(0, 12) + '...',
    //   clientId,
    // });

    try {
      // Get and validate refresh token
      const result = await this.kvManager.get<MCPRefreshToken>([
        ...this.MCP_REFRESH_TOKENS_PREFIX,
        refreshToken,
      ]);

      if (!result) {
        this.logger?.error(`TokenManager: Refresh token not found [${exchangeId}]`, undefined, {
          exchangeId,
          refreshTokenPrefix: refreshToken.substring(0, 12) + '...',
        });
        return { success: false, error: 'Invalid or expired refresh token' };
      }

      const refreshTokenData = result;
      const now = Date.now();

      // Validate refresh token hasn't expired
      if (refreshTokenData.expires_at < now) {
        this.logger?.error(`TokenManager: Refresh token expired [${exchangeId}]`, undefined, {
          exchangeId,
          expiresAt: new Date(refreshTokenData.expires_at).toISOString(),
          expiredBy: now - refreshTokenData.expires_at,
        });

        await this.kvManager.delete([...this.MCP_REFRESH_TOKENS_PREFIX, refreshToken]);
        return { success: false, error: 'Refresh token expired' };
      }

      // Validate client ID
      if (refreshTokenData.client_id !== clientId) {
        this.logger?.error(
          `TokenManager: Client ID mismatch in refresh [${exchangeId}]`,
          undefined,
          {
            exchangeId,
            expected: refreshTokenData.client_id,
            provided: clientId,
          },
        );
        return { success: false, error: 'Invalid client credentials' };
      }

      // Generate new access token with new refresh token (token rotation)
      const newAccessToken = await this.generateAccessToken(
        refreshTokenData.client_id,
        refreshTokenData.user_id,
        true, // Include new refresh token
      );

      // 🔒 SECURITY-CRITICAL: Revoke old refresh token (token rotation security)
      await this.kvManager.delete([...this.MCP_REFRESH_TOKENS_PREFIX, refreshToken]);

      // this.logger?.info(`TokenManager: Successfully exchanged refresh token [${exchangeId}]`, {
      //   exchangeId,
      //   clientId: refreshTokenData.client_id,
      //   userId: refreshTokenData.user_id,
      //   newTokenPrefix: newAccessToken.access_token.substring(0, 12) + '...',
      //   hasNewRefreshToken: !!newAccessToken.refresh_token,
      // });

      return { success: true, accessToken: newAccessToken };
    } catch (error) {
      this.logger?.error(
        `TokenManager: Failed to exchange refresh token [${exchangeId}]:`,
        toError(error),
        {
          exchangeId,
          refreshTokenPrefix: refreshToken.substring(0, 12) + '...',
        },
      );
      return { success: false, error: 'Token exchange failed' };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Generate cryptographically secure random string
   *
   * Preserves exact random generation from OAuthClientService.generateRandomString()
   * Uses Web Crypto API for cryptographically secure randomness
   */
  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    return Array.from(randomBytes)
      .map((byte) => charset[byte % charset.length])
      .join('');
  }

  /**
   * Get token statistics for monitoring
   */
  async getTokenStats(): Promise<{
    totalAccessTokens: number;
    totalRefreshTokens: number;
    totalAuthorizationCodes: number;
  }> {
    try {
      let totalAccessTokens = 0;
      let totalRefreshTokens = 0;
      let totalAuthorizationCodes = 0;

      // Count access tokens
      const accessTokens = await this.kvManager.list(this.MCP_ACCESS_TOKENS_PREFIX);
      totalAccessTokens = accessTokens.length;

      // Count refresh tokens
      const refreshTokens = await this.kvManager.list(this.MCP_REFRESH_TOKENS_PREFIX);
      totalRefreshTokens = refreshTokens.length;

      // Count authorization codes
      const authCodes = await this.kvManager.list(this.MCP_AUTH_CODES_PREFIX);
      totalAuthorizationCodes = authCodes.length;

      return {
        totalAccessTokens,
        totalRefreshTokens,
        totalAuthorizationCodes,
      };
    } catch (error) {
      this.logger?.error('TokenManager: Failed to get token stats:', toError(error));
      return {
        totalAccessTokens: 0,
        totalRefreshTokens: 0,
        totalAuthorizationCodes: 0,
      };
    }
  }
}
