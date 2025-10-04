/**
 * Authorization Handler - OAuth 2.0 Authorization Code Flow Implementation
 *
 * 🔒 SECURITY-CRITICAL: This component handles the OAuth authorization code grant flow
 * with PKCE support. All authorization request validation, code generation, and exchange
 * operations are preserved exactly from OAuthClientService.ts to maintain security.
 *
 * Security Requirements:
 * - RFC 6749 Authorization Code Grant flow compliance
 * - RFC 7636 PKCE integration for public clients
 * - Secure authorization code generation and validation
 * - State parameter handling for CSRF protection
 * - MCP session binding for third-party OAuth integration
 */

import type { Logger } from '../../types/library.types.ts';
import type { KVManager } from '../storage/KVManager.ts';
import { toError } from '../utils/Error.ts';
import type { PKCEHandler, PKCEMethod } from './PKCEHandler.ts';
import type { ClientRegistry } from './ClientRegistry.ts';
import type { //MCPAuthorizationCode,
  TokenManager,
} from './TokenManager.ts';
import type {
  //AuthorizationRequestResult,
  AuthorizationValidation,
  AuthorizeRequest,
  AuthorizeResponse,
  MCPAuthorizationRequest,
} from './OAuthTypes.ts';

/**
 * Authorization handler configuration
 */
export interface AuthorizationConfig {
  /** Supported grant types */
  supportedGrantTypes: string[];
  /** Supported response types */
  supportedResponseTypes: string[];
  /** Supported scopes */
  supportedScopes: string[];
  /** Enable PKCE support */
  enablePKCE: boolean;
  /** Require PKCE for all clients */
  requirePKCE: boolean;
  /** OAuth issuer URL */
  issuer: string;
}

/**
 * Dependencies required by AuthorizationHandler
 */
export interface AuthorizationHandlerDependencies {
  /** KV storage manager for state persistence */
  kvManager: KVManager;
  /** Logger for security event logging */
  logger?: Logger | undefined;
  /** Client registry for client validation */
  clientRegistry: ClientRegistry;
  /** PKCE handler for code challenge validation */
  pkceHandler: PKCEHandler;
  /** Token manager for authorization code generation */
  tokenManager: TokenManager;
}

/**
 * Authorization state for MCP session binding
 */
export interface AuthorizationState {
  /** Standard OAuth state */
  client_id: string;
  redirect_uri: string;
  state: string; // MCP client state

  /** MCP-specific binding */
  mcp_client_id: string;
  mcp_redirect_uri: string;
  upstream_state: string; // OAuth state

  /** PKCE parameters */
  code_challenge?: string;
  code_challenge_method?: string;

  /** Metadata */
  created_at: number;
  expires_at: number;
}

/**
 * 🔒 SECURITY-CRITICAL: OAuth 2.0 Authorization Handler
 *
 * Handles the authorization code grant flow with exact security preservation from
 * the original OAuthClientService.ts implementation. Manages authorization requests,
 * PKCE validation, state parameter handling, and MCP session binding.
 *
 * Key Security Features:
 * - RFC 6749 compliant authorization code grant flow
 * - RFC 7636 PKCE integration for public client security
 * - Secure state parameter handling for CSRF protection
 * - Authorization code generation with cryptographic security
 * - MCP session binding for third-party OAuth integration
 */
export class AuthorizationHandler {
  private kvManager: KVManager;
  private logger: Logger | undefined;
  private config: AuthorizationConfig;
  private clientRegistry: ClientRegistry;
  private pkceHandler: PKCEHandler;
  private tokenManager: TokenManager;

  // 🔒 SECURITY-CRITICAL: KV key prefixes - preserves exact structure from OAuthClientService.ts
  private readonly MCP_AUTH_REQUESTS_PREFIX = ['oauth', 'mcp_auth_requests'];
  private readonly AUTHORIZATION_STATE_PREFIX = ['oauth', 'authorization_state'];

  constructor(config: AuthorizationConfig, dependencies: AuthorizationHandlerDependencies) {
    this.kvManager = dependencies.kvManager;
    this.logger = dependencies.logger;
    this.clientRegistry = dependencies.clientRegistry;
    this.pkceHandler = dependencies.pkceHandler;
    this.tokenManager = dependencies.tokenManager;
    // Apply config with proper defaults
    this.config = {
      supportedGrantTypes: config.supportedGrantTypes ?? ['authorization_code', 'refresh_token'],
      supportedResponseTypes: config.supportedResponseTypes ?? ['code'],
      supportedScopes: config.supportedScopes ?? ['all', 'read', 'write'],
      enablePKCE: config.enablePKCE ?? true,
      requirePKCE: config.requirePKCE ?? true,
      issuer: config.issuer,
    };

    this.logger?.info('AuthorizationHandler: Initialized', {
      supportedGrantTypes: this.config.supportedGrantTypes,
      supportedResponseTypes: this.config.supportedResponseTypes,
      supportedScopes: this.config.supportedScopes,
      enablePKCE: this.config.enablePKCE,
      requirePKCE: this.config.requirePKCE,
    });
  }

  /**
   * 🔒 SECURITY-CRITICAL: Handle OAuth authorization request
   *
   * Validates authorization request and generates authorization response.
   * This is the entry point for the OAuth authorization code flow.
   */
  async handleAuthorizeRequest(
    request: AuthorizeRequest,
    userId: string,
  ): Promise<AuthorizeResponse> {
    const authId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`AuthorizationHandler: Processing authorization request [${authId}]`, {
    //   authId,
    //   clientId: request.client_id,
    //   redirectUri: request.redirect_uri,
    //   responseType: request.response_type,
    //   scope: request.scope,
    //   state: request.state,
    //   hasPKCE: !!(request.code_challenge && request.code_challenge_method),
    // });

    try {
      // Validate the authorization request
      const validation = await this.validateAuthorizationRequest(request);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid authorization request');
      }

      // Generate authorization code
      const authorizationCode = await this.tokenManager.generateAuthorizationCode(
        request.client_id,
        userId,
        request.redirect_uri,
        request.code_challenge,
        request.scope,
      );

      // Build redirect URL with authorization code
      const redirectUrl = this.buildRedirectUrl(
        request.redirect_uri,
        {
          code: authorizationCode,
          state: request.state || '',
        },
      );

      // this.logger?.info(`AuthorizationHandler: Authorization request successful [${authId}]`, {
      //   authId,
      //   clientId: request.client_id,
      //   userId,
      //   codeGenerated: true,
      // });

      return {
        code: authorizationCode,
        state: request.state || '',
        redirectUrl,
      };
    } catch (error) {
      this.logger?.error(
        `AuthorizationHandler: Authorization request failed [${authId}]:`,
        toError(error),
        {
          authId,
          clientId: request.client_id,
          redirectUri: request.redirect_uri,
        },
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Validate authorization request
   *
   * Comprehensive validation of OAuth authorization request parameters.
   * Preserves exact validation logic from OAuthClientService.ts.
   */
  async validateAuthorizationRequest(request: AuthorizeRequest): Promise<AuthorizationValidation> {
    const validationId = Math.random().toString(36).substring(2, 15);

    this.logger?.debug(`AuthorizationHandler: Validating authorization request [${validationId}]`, {
      validationId,
      clientId: request.client_id,
      responseType: request.response_type,
      hasPKCE: !!(request.code_challenge && request.code_challenge_method),
    });

    try {
      // Validate response type
      if (!this.config.supportedResponseTypes.includes(request.response_type)) {
        return {
          valid: false,
          error: `Unsupported response type: ${request.response_type}`,
        };
      }

      // Validate client
      const clientValidation = await this.clientRegistry.validateClient(
        request.client_id,
        request.redirect_uri,
      );
      if (!clientValidation.valid) {
        return {
          valid: false,
          error: clientValidation.error || 'Invalid client',
        };
      }

      // Validate scope
      const scopes = request.scope ? request.scope.split(' ') : ['read'];
      for (const scope of scopes) {
        if (!this.config.supportedScopes.includes(scope)) {
          return {
            valid: false,
            error: `Unsupported scope: ${scope}`,
          };
        }
      }

      // Validate PKCE if present or required
      if (request.code_challenge && request.code_challenge_method) {
        if (!this.config.enablePKCE) {
          return {
            valid: false,
            error: 'PKCE not supported',
          };
        }

        // Validate PKCE method
        const supportedMethods = this.pkceHandler.getSupportedMethods();
        if (!supportedMethods.includes(request.code_challenge_method as PKCEMethod)) {
          return {
            valid: false,
            error: `Unsupported PKCE method: ${request.code_challenge_method}`,
          };
        }
      } else if (this.config.requirePKCE) {
        return {
          valid: false,
          error: 'PKCE required for this client',
        };
      }

      // Validate state parameter (must be present for CSRF protection)
      if (!request.state) {
        return {
          valid: false,
          error: 'State parameter is required',
        };
      }

      this.logger?.debug(
        `AuthorizationHandler: Authorization request validation successful [${validationId}]`,
        {
          validationId,
          clientId: request.client_id,
          scopes: scopes.length,
          hasPKCE: !!(request.code_challenge && request.code_challenge_method),
        },
      );

      return {
        valid: true,
        clientId: request.client_id,
        redirectUri: request.redirect_uri,
        scopes,
        codeChallenge: request.code_challenge,
      };
    } catch (error) {
      this.logger?.error(
        `AuthorizationHandler: Authorization request validation failed [${validationId}]:`,
        toError(error),
      );
      return {
        valid: false,
        error: 'Authorization request validation failed',
      };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Exchange authorization code for tokens
   *
   * Validates authorization code and client credentials, then delegates to TokenManager.
   * This method performs comprehensive security validation before token issuance.
   */
  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const exchangeId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`AuthorizationHandler: Starting authorization code exchange [${exchangeId}]`,
    //   {
    //     exchangeId,
    //     codePrefix: code.substring(0, 12) + '...',
    //     clientId,
    //     redirectUri,
    //     hasCodeVerifier: !!codeVerifier,
    //   },
    // );

    try {
      // Get and validate authorization code
      const authCode = await this.tokenManager.getAuthorizationCode(code);
      if (!authCode) {
        return { success: false, error: 'Invalid or expired authorization code' };
      }

      // Validate client credentials
      if (authCode.client_id !== clientId) {
        const errorMsg = `Client ID mismatch in code exchange [${exchangeId}]`;
        this.logger?.error(`AuthorizationHandler: ${errorMsg}`, toError(errorMsg), {
          exchangeId,
          expected: authCode.client_id,
          provided: clientId,
        });
        return { success: false, error: 'Invalid client credentials' };
      }

      if (authCode.redirect_uri !== redirectUri) {
        const errorMsg = `Redirect URI mismatch in code exchange [${exchangeId}]`;
        this.logger?.error(`AuthorizationHandler: ${errorMsg}`, toError(errorMsg), {
          exchangeId,
          expected: authCode.redirect_uri,
          provided: redirectUri,
        });
        return { success: false, error: 'Invalid client credentials' };
      }

      // Validate PKCE if present
      if (authCode.code_challenge) {
        if (!codeVerifier) {
          const errorMsg = `Missing PKCE code verifier [${exchangeId}]`;
          this.logger?.error(`AuthorizationHandler: ${errorMsg}`, toError(errorMsg), {
            exchangeId,
            hasCodeChallenge: true,
            hasCodeVerifier: false,
          });
          return { success: false, error: 'PKCE code verifier required' };
        }

        const pkceValidation = await this.pkceHandler.validateCodeChallenge(
          authCode.code_challenge,
          codeVerifier,
          'S256', // We only support S256
        );

        if (!pkceValidation.valid) {
          this.logger?.error(
            `AuthorizationHandler: PKCE validation failed [${exchangeId}]`,
            toError(pkceValidation.error),
            {
              exchangeId,
            },
          );
          return { success: false, error: 'Invalid PKCE code verifier' };
        }
      }

      // 🔒 SECURITY-CRITICAL: Delete authorization code after successful validation (one-time use)
      await this.tokenManager.deleteAuthorizationCode(code);

      // this.logger?.info(`AuthorizationHandler: Authorization code exchange successful [${exchangeId}]`,
      //   {
      //     exchangeId,
      //     clientId: authCode.client_id,
      //     userId: authCode.user_id,
      //   },
      // );

      return { success: true };
    } catch (error) {
      this.logger?.error(
        `AuthorizationHandler: Authorization code exchange failed [${exchangeId}]:`,
        toError(error),
      );
      return { success: false, error: 'Authorization code exchange failed' };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Store MCP authorization request for session binding
   *
   * Preserves exact MCP auth request binding logic from OAuthClientService.storeMCPAuthRequest()
   * Links MCP client authorization requests to external OAuth flows for secure session binding.
   */
  async storeMCPAuthRequest(
    externalState: string,
    request: MCPAuthorizationRequest,
  ): Promise<void> {
    const storeId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`AuthorizationHandler: Storing MCP auth request [${storeId}]`, {
    //   storeId,
    //   externalState,
    //   clientId: request.client_id,
    //   userId: request.user_id,
    //   expiresAt: new Date(request.expires_at).toISOString(),
    // });

    try {
      await this.kvManager.set(
        [...this.MCP_AUTH_REQUESTS_PREFIX, externalState],
        request,
        { expireIn: 10 * 60 * 1000 }, // 10 minutes
      );

      this.logger?.debug(
        `AuthorizationHandler: Stored MCP auth request successfully [${storeId}]`,
        {
          storeId,
          externalState,
          clientId: request.client_id,
          ttl: '10 minutes',
        },
      );
    } catch (error) {
      this.logger?.error(
        `AuthorizationHandler: Failed to store MCP auth request [${storeId}]:`,
        toError(error),
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Retrieve MCP authorization request by External state
   *
   * Preserves exact MCP auth request retrieval logic from OAuthClientService.getMCPAuthRequest()
   * Used for linking External OAuth callback to original MCP client request.
   */
  async getMCPAuthRequest(externalState: string): Promise<MCPAuthorizationRequest | null> {
    const lookupId = Math.random().toString(36).substring(2, 15);

    // this.logger?.info(`AuthorizationHandler: Looking up MCP auth request [${lookupId}]`, {
    //   lookupId,
    //   externalState,
    // });

    try {
      const result = await this.kvManager.get<MCPAuthorizationRequest>(
        [...this.MCP_AUTH_REQUESTS_PREFIX, externalState],
      );

      if (!result) {
        this.logger?.warn(`AuthorizationHandler: MCP auth request not found [${lookupId}]`, {
          lookupId,
          externalState,
        });
        return null;
      }

      const request = result;
      const now = Date.now();

      // this.logger?.info(`AuthorizationHandler: MCP auth request found [${lookupId}]`, {
      //   lookupId,
      //   request: {
      //     client_id: request.client_id,
      //     redirect_uri: request.redirect_uri,
      //     state: request.state,
      //     user_id: request.user_id,
      //     external_state: request.external_state,
      //     created_at: new Date(request.created_at).toISOString(),
      //     expires_at: new Date(request.expires_at).toISOString(),
      //     hasCodeChallenge: !!request.code_challenge,
      //     isExpired: request.expires_at < now,
      //     timeToExpiry: request.expires_at - now,
      //   },
      // });

      // Check if request has expired
      if (request.expires_at < now) {
        const errorMsg = `MCP auth request expired [${lookupId}]`;
        this.logger?.error(`AuthorizationHandler: ${errorMsg}`, toError(errorMsg), {
          lookupId,
          externalState,
          expiresAt: new Date(request.expires_at).toISOString(),
          expiredBy: now - request.expires_at,
        });

        // Clean up expired request
        await this.kvManager.delete([...this.MCP_AUTH_REQUESTS_PREFIX, externalState]);
        return null;
      }

      return request;
    } catch (error) {
      this.logger?.error(
        `AuthorizationHandler: Failed to get MCP auth request [${lookupId}]:`,
        toError(error),
      );
      return null;
    }
  }

  /**
   * Store authorization state for complex OAuth flows
   */
  async storeAuthorizationState(state: string, data: AuthorizationState): Promise<void> {
    try {
      await this.kvManager.set(
        [...this.AUTHORIZATION_STATE_PREFIX, state],
        data,
        { expireIn: 10 * 60 * 1000 }, // 10 minutes
      );

      this.logger?.debug('AuthorizationHandler: Stored authorization state', {
        state,
        clientId: data.client_id,
      });
    } catch (error) {
      this.logger?.error(
        'AuthorizationHandler: Failed to store authorization state:',
        toError(error),
      );
      throw error;
    }
  }

  /**
   * Get authorization state
   */
  async getAuthorizationState(state: string): Promise<AuthorizationState | null> {
    try {
      const result = await this.kvManager.get<AuthorizationState>(
        [...this.AUTHORIZATION_STATE_PREFIX, state],
      );

      if (!result) {
        return null;
      }

      // Check expiry
      if (result.expires_at < Date.now()) {
        await this.kvManager.delete([...this.AUTHORIZATION_STATE_PREFIX, state]);
        return null;
      }

      return result;
    } catch (error) {
      this.logger?.error(
        'AuthorizationHandler: Failed to get authorization state:',
        toError(error),
      );
      return null;
    }
  }

  /**
   * Build redirect URL with parameters
   */
  private buildRedirectUrl(baseUrl: string, params: Record<string, string>): string {
    try {
      const url = new URL(baseUrl);

      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      return url.toString();
    } catch (error) {
      this.logger?.error('AuthorizationHandler: Failed to build redirect URL:', toError(error), {
        baseUrl,
        params,
      });
      throw new Error('Invalid redirect URI');
    }
  }
}
