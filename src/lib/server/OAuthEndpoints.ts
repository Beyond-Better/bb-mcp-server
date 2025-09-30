/**
 * OAuth Endpoints - HTTP endpoints for OAuth 2.0 flows
 *
 * Provides HTTP endpoint wrappers that delegate to the OAuth handlers.
 * This maintains clean separation between HTTP transport and OAuth business logic.
 *
 * Integration with OAuth Components:
 * - OAuthProvider: Main OAuth orchestrator for authorization and token flows
 * - AuthorizationHandler: Authorization code flow handling
 * - TokenManager: Token operations and validation
 * - ClientRegistry: Client registration and validation
 * - OAuthMetadata: RFC 8414 metadata generation
 */

import type { Logger } from '../../types/library.types.ts';
import type { OAuthProvider } from '../auth/OAuthProvider.ts';
import type { AuthorizeRequest, TokenRequest } from '../auth/OAuthTypes.ts';
import { toError } from '../utils/Error.ts';
import { reconstructOriginalUrl } from '../utils/UrlUtils.ts';

/**
 * OAuth HTTP endpoints implementation
 *
 * Integrates with OAuth Provider to handle OAuth 2.0 HTTP endpoints.
 * All OAuth business logic is delegated to the existing OAuth components,
 * this class only handles HTTP request/response transformation.
 */
export class OAuthEndpoints {
  private oauthProvider: OAuthProvider;
  private logger: Logger;

  constructor(oauthProvider: OAuthProvider, logger: Logger) {
    this.oauthProvider = oauthProvider;
    this.logger = logger;

    this.logger.info('OAuthEndpoints: Initialized with OAuth provider');
  }

  /**
   * Handle OAuth endpoint requests
   */
  async handleRequest(request: Request, path: string, method: string): Promise<Response> {
    this.logger.debug(`OAuthEndpoints: Handling ${method} ${path}`);

    switch (path) {
      case '/authorize':
        if (method === 'GET') return await this.handleAuthorize(request);
        break;

      case '/token':
        if (method === 'POST') return await this.handleToken(request);
        break;

      case '/register':
        if (method === 'POST') return await this.handleRegister(request);
        break;

      case '/callback':
      case '/oauth/callback':
      case '/auth/callback':
        if (method === 'GET') return await this.handleCallback(request);
        break;
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * OAuth authorization endpoint - delegates to OAuthProvider
   */
  private async handleAuthorize(request: Request): Promise<Response> {
    const authId = Math.random().toString(36).substring(2, 15);

    try {
      const url = reconstructOriginalUrl(request);

      // Extract OAuth authorization parameters
      const authRequest = {
        response_type: url.searchParams.get('response_type'),
        client_id: url.searchParams.get('client_id'),
        redirect_uri: url.searchParams.get('redirect_uri'),
        scope: url.searchParams.get('scope'),
        state: url.searchParams.get('state'),
        code_challenge: url.searchParams.get('code_challenge'),
        code_challenge_method: url.searchParams.get('code_challenge_method'),
      };

      this.logger.info(`OAuthEndpoints: Authorization request [${authId}]`, {
        authId,
        clientId: authRequest.client_id,
        redirectUri: authRequest.redirect_uri,
        responseType: authRequest.response_type,
        scope: authRequest.scope,
        hasPKCE: !!(authRequest.code_challenge && authRequest.code_challenge_method),
      });

      // Validate required parameters
      if (!authRequest.client_id) {
        return this.generateOAuthError('invalid_request', 'client_id parameter is required');
      }

      if (!authRequest.redirect_uri) {
        return this.generateOAuthError('invalid_request', 'redirect_uri parameter is required');
      }

      if (!authRequest.state) {
        return this.generateOAuthError('invalid_request', 'state parameter is required');
      }

      if (!authRequest.response_type) {
        return this.generateOAuthError('invalid_request', 'response_type parameter is required');
      }

      // Create user ID based on client ID (for this OAuth provider)
      const userId = `client_${authRequest.client_id}`;

      // Delegate to OAuth Provider for authorization handling
      const authRequest_clean: AuthorizeRequest = {
        response_type: authRequest.response_type!,
        client_id: authRequest.client_id!,
        redirect_uri: authRequest.redirect_uri!,
        scope: authRequest.scope || 'read',
        state: authRequest.state!,
      };

      // Add optional PKCE parameters only if they exist
      if (authRequest.code_challenge) {
        authRequest_clean.code_challenge = authRequest.code_challenge;
      }
      if (authRequest.code_challenge_method) {
        authRequest_clean.code_challenge_method = authRequest.code_challenge_method;
      }

      const authResponse = await this.oauthProvider.handleAuthorizeRequest(
        authRequest_clean,
        userId,
      );

      this.logger.info(`OAuthEndpoints: Authorization successful [${authId}]`, {
        authId,
        clientId: authRequest.client_id,
        userId,
        redirectUrl: authResponse.redirectUrl,
      });

      // Return redirect response
      return new Response(null, {
        status: 302,
        headers: {
          'Location': authResponse.redirectUrl,
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        },
      });
    } catch (error) {
      this.logger.error(`OAuthEndpoints: Authorization error [${authId}]:`, toError(error));
      return this.generateOAuthError('server_error', 'Authorization request failed');
    }
  }

  /**
   * OAuth token endpoint - delegates to OAuthProvider
   */
  private async handleToken(request: Request): Promise<Response> {
    const tokenId = Math.random().toString(36).substring(2, 15);

    try {
      // Parse form data from request body
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (error) {
        return this.generateOAuthError('invalid_request', 'Invalid form data in request body');
      }

      const tokenRequest = {
        grant_type: formData.get('grant_type')?.toString(),
        client_id: formData.get('client_id')?.toString(),
        client_secret: formData.get('client_secret')?.toString(),
        code: formData.get('code')?.toString(),
        redirect_uri: formData.get('redirect_uri')?.toString(),
        refresh_token: formData.get('refresh_token')?.toString(),
        code_verifier: formData.get('code_verifier')?.toString(),
        state: formData.get('state')?.toString(),
      };

      this.logger.info(`OAuthEndpoints: Token request [${tokenId}]`, {
        tokenId,
        grantType: tokenRequest.grant_type,
        clientId: tokenRequest.client_id,
        hasCode: !!tokenRequest.code,
        hasRefreshToken: !!tokenRequest.refresh_token,
        hasCodeVerifier: !!tokenRequest.code_verifier,
      });

      // Validate required parameters
      if (!tokenRequest.grant_type) {
        return this.generateOAuthError('invalid_request', 'grant_type parameter is required');
      }

      if (!tokenRequest.client_id) {
        return this.generateOAuthError('invalid_request', 'client_id parameter is required');
      }

      // Validate grant_type
      if (
        tokenRequest.grant_type !== 'authorization_code' &&
        tokenRequest.grant_type !== 'refresh_token'
      ) {
        return this.generateOAuthError(
          'unsupported_grant_type',
          `Grant type '${tokenRequest.grant_type}' is not supported`,
        );
      }

      // Create clean token request object
      const tokenRequest_clean: TokenRequest = {
        grant_type: tokenRequest.grant_type as 'authorization_code' | 'refresh_token',
        client_id: tokenRequest.client_id!,
      };

      // Add optional parameters only if they exist
      if (tokenRequest.client_secret) {
        tokenRequest_clean.client_secret = tokenRequest.client_secret;
      }
      if (tokenRequest.code) {
        tokenRequest_clean.code = tokenRequest.code;
      }
      if (tokenRequest.redirect_uri) {
        tokenRequest_clean.redirect_uri = tokenRequest.redirect_uri;
      }
      if (tokenRequest.refresh_token) {
        tokenRequest_clean.refresh_token = tokenRequest.refresh_token;
      }
      if (tokenRequest.code_verifier) {
        tokenRequest_clean.code_verifier = tokenRequest.code_verifier;
      }

      // Delegate to OAuth Provider for token handling
      const tokenResponse = await this.oauthProvider.handleTokenRequest(tokenRequest_clean);

      this.logger.info(`OAuthEndpoints: Token issued successfully [${tokenId}]`, {
        tokenId,
        clientId: tokenRequest.client_id,
        grantType: tokenRequest.grant_type,
        tokenType: tokenResponse.token_type,
        hasRefreshToken: !!tokenResponse.refresh_token,
      });

      return new Response(JSON.stringify(tokenResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        },
      });
    } catch (error) {
      this.logger.error(`OAuthEndpoints: Token error [${tokenId}]:`, toError(error));
      
      // Extract specific error message from the error
      const errorMessage = error instanceof Error ? error.message : 'Token request failed';
      
      // Map specific error messages to proper OAuth error codes (RFC 6749)
      let oauthError = 'invalid_request';
      if (errorMessage.includes('refresh token') || errorMessage.includes('Invalid or expired')) {
        oauthError = 'invalid_grant';
      } else if (errorMessage.includes('client') || errorMessage.includes('Client')) {
        oauthError = 'invalid_client';
      } else if (errorMessage.includes('authorization code') || errorMessage.includes('Authorization code')) {
        oauthError = 'invalid_grant';
      }
      
      return this.generateOAuthError(oauthError, errorMessage);
    }
  }

  /**
   * OAuth client registration endpoint - delegates to OAuthProvider
   */
  private async handleRegister(request: Request): Promise<Response> {
    const registrationId = Math.random().toString(36).substring(2, 15);

    try {
      // Parse request body
      let requestBody;
      try {
        const bodyText = await request.text();
        if (!bodyText) {
          return this.generateOAuthError('invalid_request', 'Request body is required');
        }
        requestBody = JSON.parse(bodyText);
      } catch (error) {
        return this.generateOAuthError('invalid_request', 'Invalid JSON in request body');
      }

      this.logger.info(`OAuthEndpoints: Client registration request [${registrationId}]`, {
        registrationId,
        clientName: requestBody.client_name,
        redirectUris: requestBody.redirect_uris?.length || 0,
      });

      // Extract client metadata from request headers
      const userAgent = request.headers.get('user-agent');
      const ipAddress = request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';
      const metadata = {
        ...(userAgent && { userAgent }),
        ipAddress,
      };

      // Delegate to OAuth Provider for client registration
      const registrationResponse = await this.oauthProvider.handleClientRegistration(
        requestBody,
        metadata,
      );

      this.logger.info(`OAuthEndpoints: Client registered successfully [${registrationId}]`, {
        registrationId,
        clientId: registrationResponse.client_id,
        clientName: requestBody.client_name,
      });

      return new Response(JSON.stringify(registrationResponse, null, 2), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      this.logger.error(`OAuthEndpoints: Registration error [${registrationId}]:`, toError(error));

      if (error instanceof Error) {
        // Check for validation errors
        if (
          error.message.includes('redirect URI') ||
          error.message.includes('redirect_uris') ||
          error.message.includes('HTTPS')
        ) {
          return this.generateOAuthError('invalid_request', error.message);
        }
      }

      return this.generateOAuthError('server_error', 'Client registration failed');
    }
  }

  /**
   * OAuth callback endpoint - delegates to OAuthProvider
   */
  private async handleCallback(request: Request): Promise<Response> {
    const callbackId = Math.random().toString(36).substring(2, 15);

    try {
      const url = reconstructOriginalUrl(request);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      this.logger.info(`OAuthEndpoints: OAuth callback [${callbackId}]`, {
        callbackId,
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
      });

      // Handle OAuth errors
      if (error) {
        const errorMsg = errorDescription || error;
        this.logger.error(
          `OAuthEndpoints: OAuth callback error [${callbackId}]:`,
          toError(errorMsg),
        );
        return this.generateErrorPage(errorMsg);
      }

      // Validate required parameters
      if (!code || !state) {
        const errorMsg = 'Missing required OAuth parameters';
        this.logger.error(`OAuthEndpoints: ${errorMsg} [${callbackId}]`);
        return this.generateErrorPage(errorMsg);
      }

      // Handle OAuth callback by looking up MCP auth request
      const mcpAuthRequest = await this.oauthProvider.getMCPAuthRequest(state);

      if (!mcpAuthRequest) {
        const errorMsg = 'Invalid or expired authorization request';
        this.logger.error(`OAuthEndpoints: ${errorMsg} [${callbackId}]`);
        return this.generateErrorPage(errorMsg);
      }

      // Generate MCP authorization code
      const mcpAuthCode = await this.oauthProvider.generateMCPAuthorizationCode(
        mcpAuthRequest.client_id,
        mcpAuthRequest.user_id,
        mcpAuthRequest.redirect_uri,
        mcpAuthRequest.code_challenge,
      );

      // Build redirect URL back to MCP client
      const redirectUrl = new URL(mcpAuthRequest.redirect_uri);
      redirectUrl.searchParams.set('code', mcpAuthCode);
      redirectUrl.searchParams.set('state', mcpAuthRequest.state);

      this.logger.info(`OAuthEndpoints: Callback successful [${callbackId}]`, {
        callbackId,
        clientId: mcpAuthRequest.client_id,
        redirectUrl: redirectUrl.toString(),
      });

      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl.toString(),
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        },
      });
    } catch (error) {
      this.logger.error(`OAuthEndpoints: Callback error [${callbackId}]:`, toError(error));
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return this.generateErrorPage(errorMsg);
    }
  }

  /**
   * Well-known endpoints (OAuth metadata)
   * Supports both oauth-authorization-server (RFC 8414) and oauth-protected-resource (RFC 9068)
   */
  async handleWellKnown(request: Request, path: string, method: string): Promise<Response> {
    // Support both RFC 8414 and RFC 9068 endpoints
    // RFC 9728: Resource-specific metadata paths like oauth-protected-resource/mcp are also supported
    const isAuthServerMetadata = path === 'oauth-authorization-server';
    const isProtectedResourceMetadata = path === 'oauth-protected-resource' || path.startsWith('oauth-protected-resource/');
    
    if ((isAuthServerMetadata || isProtectedResourceMetadata) && method === 'GET') {
      try {
        // Delegate to OAuth Provider for metadata generation
        const metadata = await this.oauthProvider.getAuthorizationServerMetadata();
        
        // RFC 9728: If this is a resource-specific metadata request, add the resource field
        if (isProtectedResourceMetadata && path.startsWith('oauth-protected-resource/')) {
          const resourcePath = '/' + path.substring('oauth-protected-resource/'.length);
          const url = new URL(request.url);
          const resourceUrl = `${url.protocol}//${url.host}${resourcePath}`;
          
          // Add resource field to metadata for RFC 9728 compliance
          (metadata as any).resource = resourceUrl;
        }

        return new Response(JSON.stringify(metadata, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        this.logger.error('OAuthEndpoints: Metadata generation error:', toError(error));
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Generate OAuth error response
   */
  private generateOAuthError(error: string, description?: string): Response {
    const errorResponse = {
      error,
      ...(description && { error_description: description }),
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });
  }

  /**
   * Generate error page (HTML response for browser flows)
   */
  private generateErrorPage(error: string): Response {
    const errorPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 100px auto;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .error {
            color: #dc3545;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .message {
            color: #6c757d;
            margin-bottom: 20px;
            word-break: break-word;
        }
        .close-button {
            background: #dc3545;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .close-button:hover {
            background: #c82333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">❌</div>
        <div class="error">Authentication Failed</div>
        <div class="message">
            There was an error during authentication:<br><br>
            <strong>${this.escapeHtml(error)}</strong><br><br>
            Please try again or contact support if the problem persists.
        </div>
        <button class="close-button" onclick="window.close()">Close Window</button>
    </div>
    <script>
        // Auto-close after 10 seconds if parent window exists
        if (window.opener) {
            setTimeout(() => {
                window.close();
            }, 10000);
        }
    </script>
</body>
</html>`;

    return new Response(errorPage, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get OAuth endpoints metrics
   */
  getMetrics(): {
    endpoints: {
      authorize: string;
      token: string;
      register: string;
      callback: string;
      metadata: string;
    };
    provider: string;
  } {
    return {
      endpoints: {
        authorize: '/authorize',
        token: '/token',
        register: '/register',
        callback: '/callback',
        metadata: '/.well-known/oauth-authorization-server',
      },
      provider: 'Generic OAuth Provider',
    };
  }
}
