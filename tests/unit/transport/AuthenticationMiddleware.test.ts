/**
 * AuthenticationMiddleware Unit Tests
 *
 * 🔒 SECURITY-CRITICAL: Comprehensive tests for MCP authentication middleware
 *
 * Test Coverage Requirements:
 * - 100% coverage for authentication middleware logic
 * - MCP specification compliance validation
 * - OAuth provider and consumer integration
 * - Session binding with automatic token refresh
 * - Error handling and client guidance
 * - Transport-specific authentication requirements
 * - Endpoint access control validation
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { AuthenticationMiddleware } from '../../../src/lib/transport/AuthenticationMiddleware.ts';
import type {
  AuthenticationConfig,
  //AuthenticationContext,
  AuthenticationDependencies,
  AuthenticationResult,
} from '../../../src/lib/transport/AuthenticationMiddleware.ts';
import type { Logger } from '../../../src/types/library.types.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Mock OAuth Provider
class MockOAuthProvider {
  private validTokens = new Map<string, { clientId: string; userId: string; scope: string }>();
  private refreshResults = new Map<
    string,
    { success: boolean; actionTaken?: string; error?: string; errorCode?: string }
  >();

  constructor() {
    // Add some default valid tokens
    this.validTokens.set('valid_mcp_token_123', {
      clientId: 'test_client_123',
      userId: 'test_user_456',
      scope: 'read write',
    });
    this.validTokens.set('expired_token_needs_refresh', {
      clientId: 'refresh_client',
      userId: 'refresh_user',
      scope: 'read',
    });
  }

  async validateAccessToken(token: string) {
    const tokenData = this.validTokens.get(token);
    if (tokenData) {
      return {
        valid: true,
        clientId: tokenData.clientId,
        userId: tokenData.userId,
        scope: tokenData.scope,
      };
    }
    return {
      valid: false,
      error: 'Invalid access token',
      errorCode: 'invalid_token',
    };
  }

  async authorizeMCPRequest(bearerToken: string, authService?: any, apiClient?: any) {
    const token = bearerToken.startsWith('Bearer ') ? bearerToken.slice(7) : bearerToken;

    // Check if this token should trigger refresh flow
    if (token === 'expired_token_needs_refresh') {
      const refreshResult = this.refreshResults.get(token);
      if (refreshResult) {
        if (refreshResult.success) {
          return {
            authorized: true,
            clientId: 'refresh_client',
            userId: 'refresh_user',
            scope: ['read'],
            actionTaken: refreshResult.actionTaken || 'third_party_token_refreshed',
          };
        } else {
          return {
            authorized: false,
            error: refreshResult.error || 'Third-party token refresh failed',
            errorCode: refreshResult.errorCode || 'third_party_reauth_required',
            clientId: 'refresh_client',
            userId: 'refresh_user',
          };
        }
      }
    }

    const tokenData = this.validTokens.get(token);
    if (tokenData) {
      return {
        authorized: true,
        clientId: tokenData.clientId,
        userId: tokenData.userId,
        scope: tokenData.scope.split(' '),
      };
    }
    return {
      authorized: false,
      error: 'Invalid access token',
      errorCode: 'invalid_token',
    };
  }

  // Required methods from OAuthProvider (stubs)
  async handleAuthorizeRequest() {
    throw new Error('Mock method');
  }
  async handleTokenRequest() {
    throw new Error('Mock method');
  }
  async handleClientRegistration() {
    throw new Error('Mock method');
  }
  getAuthorizationServerMetadata() {
    throw new Error('Mock method');
  }
  async validateMCPAccessToken() {
    throw new Error('Mock method');
  }
  async storeMCPAuthRequest() {
    throw new Error('Mock method');
  }
  async getMCPAuthRequest() {
    throw new Error('Mock method');
  }
  async introspectToken() {
    throw new Error('Mock method');
  }
  async generateMCPAuthorizationCode() {
    throw new Error('Mock method');
  }
  async exchangeMCPAuthorizationCode() {
    throw new Error('Mock method');
  }
  async getTokenMapping() {
    throw new Error('Mock method');
  }

  // Test helper methods
  setRefreshResult(
    token: string,
    result: { success: boolean; actionTaken?: string; error?: string; errorCode?: string },
  ) {
    this.refreshResults.set(token, result);
  }

  addValidToken(token: string, clientId: string, userId: string, scope = 'read write') {
    this.validTokens.set(token, { clientId, userId, scope });
  }
}

// Mock OAuth Consumer
class MockOAuthConsumer {
  private userAuthStatus = new Map<string, boolean>();
  private refreshResults = new Map<string, boolean>();

  constructor() {
    // Default user auth statuses
    this.userAuthStatus.set('test_user_456', true);
    this.userAuthStatus.set('refresh_user', false); // Needs refresh
  }

  async isUserAuthenticated(userId: string): Promise<boolean> {
    return this.userAuthStatus.get(userId) ?? false;
  }

  async getUserCredentials(userId: string): Promise<any> {
    return {
      tokens: {
        refreshToken: `refresh_token_for_${userId}`,
        expiresAt: Date.now() - 1000, // Expired
      },
    };
  }

  async updateUserCredentials(userId: string, tokens: any): Promise<boolean> {
    return this.refreshResults.get(userId) ?? true;
  }

  // Required methods from OAuthConsumer (stubs)
  async initialize() {}
  async startAuthorizationFlow() {
    throw new Error('Mock method');
  }
  async handleAuthorizationCallback() {
    throw new Error('Mock method');
  }
  async getValidAccessToken() {
    throw new Error('Mock method');
  }
  async revokeUserCredentials() {
    throw new Error('Mock method');
  }
  async getAuthenticatedUsers() {
    throw new Error('Mock method');
  }
  async cleanup() {}

  // Test helper methods
  setUserAuthStatus(userId: string, isAuth: boolean) {
    this.userAuthStatus.set(userId, isAuth);
  }

  setRefreshResult(userId: string, success: boolean) {
    this.refreshResults.set(userId, success);
  }
}

// Mock Third-party API Client
class MockThirdPartyApiClient {
  private refreshResults = new Map<string, any>();

  constructor() {
    // Default refresh results
    this.refreshResults.set('refresh_token_for_refresh_user', {
      accessToken: 'new_refreshed_token',
      expiresAt: Date.now() + 3600000,
      refreshToken: 'new_refresh_token',
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<any> {
    return this.refreshResults.get(refreshToken) || null;
  }

  // Test helper methods
  setRefreshResult(refreshToken: string, result: any) {
    this.refreshResults.set(refreshToken, result);
  }
}

// Helper to create test middleware
function createTestMiddleware(
  config: Partial<AuthenticationConfig> = {},
  deps: Partial<AuthenticationDependencies> = {},
) {
  const fullConfig: AuthenticationConfig = {
    enabled: true,
    skipAuthentication: false,
    requireAuthentication: true,
    ...config,
  };

  // Don't inject default OAuth provider - let caller specify
  const fullDeps: AuthenticationDependencies = {
    logger: mockLogger,
    ...deps,
  };

  return new AuthenticationMiddleware(fullConfig, fullDeps);
}

Deno.test({
  name: 'AuthenticationMiddleware - Initialize with Configuration',
  fn() {
    const middleware = createTestMiddleware();
    assertExists(middleware);
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Authentication Required Detection',
  fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    // MCP endpoints should require authentication
    assert(middleware.isAuthenticationRequired(new URL('http://localhost:3000/mcp')));

    // Open endpoints should not require authentication
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/status')));
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/health')));
    assert(
      !middleware.isAuthenticationRequired(
        new URL('http://localhost:3000/.well-known/oauth-authorization-server'),
      ),
    );
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/authorize')));
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/token')));
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/register')));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Skip Authentication Override',
  fn() {
    const middleware = createTestMiddleware({ skipAuthentication: true });

    // Even MCP endpoints should not require auth when skipAuthentication is true
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/mcp')));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - No OAuth Provider Available',
  fn() {
    const middleware = createTestMiddleware({}, {});

    // Should not require auth when no OAuth provider is available
    assert(!middleware.isAuthenticationRequired(new URL('http://localhost:3000/mcp')));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Valid Token Authentication (🔒 SECURITY CRITICAL)',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer valid_mcp_token_123',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, true);
    assertEquals(result.clientId, 'test_client_123');
    assertEquals(result.userId, 'test_user_456');
    assert(result.scope?.includes('read'));
    assert(result.scope?.includes('write'));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Missing Authorization Header',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp');

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    assertEquals(result.error, 'Missing Authorization header');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Invalid Authorization Header Format',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Basic some-basic-auth', // Wrong format
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    assert(result.error?.includes('Invalid Authorization header format'));
    assert(result.error?.includes('Expected "Bearer <token>"'));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Empty Bearer Token',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer ', // Empty token (Request trims trailing space)
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    // Note: Request API trims header values, so 'Bearer ' becomes 'Bearer'
    // This triggers the 'Invalid Authorization header format' error
    assertExists(result.error);
    assert(result.error.includes('Invalid Authorization header format'));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Token Too Short',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer abc', // Too short
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    assert(result.error?.includes('Authorization token too short'));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Invalid Token',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer invalid_token_12345',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    assertEquals(result.error, 'Invalid access token');
    assertEquals(result.errorCode, 'invalid_token');
  },
});

Deno.test({
  name:
    'AuthenticationMiddleware - Session Binding with Valid Third-party Token (🔒 SECURITY CRITICAL)',
  async fn() {
    const mockOAuthConsumer = new MockOAuthConsumer();
    const mockApiClient = new MockThirdPartyApiClient();

    const middleware = createTestMiddleware({}, {
      oauthProvider: new MockOAuthProvider() as any,
      oauthConsumer: mockOAuthConsumer as any,
      thirdPartyApiClient: mockApiClient,
    });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer valid_mcp_token_123',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, true);
    assertEquals(result.clientId, 'test_client_123');
    assertEquals(result.userId, 'test_user_456');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Session Binding with Auto-refresh (🔒 SECURITY CRITICAL)',
  async fn() {
    const mockOAuthProvider = new MockOAuthProvider();
    const mockOAuthConsumer = new MockOAuthConsumer();
    const mockApiClient = new MockThirdPartyApiClient();

    // Set up scenario where third-party token needs refresh
    mockOAuthConsumer.setUserAuthStatus('refresh_user', false);
    mockOAuthConsumer.setRefreshResult('refresh_user', true);
    mockOAuthProvider.setRefreshResult('expired_token_needs_refresh', {
      success: true,
      actionTaken: 'third_party_token_refreshed',
    });

    const middleware = createTestMiddleware({}, {
      oauthProvider: mockOAuthProvider as any,
      oauthConsumer: mockOAuthConsumer as any,
      thirdPartyApiClient: mockApiClient,
    });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer expired_token_needs_refresh',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, true);
    assertEquals(result.actionTaken, 'third_party_token_refreshed');
    assertEquals(result.clientId, 'refresh_client');
    assertEquals(result.userId, 'refresh_user');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Session Binding with Failed Refresh (🔒 SECURITY CRITICAL)',
  async fn() {
    const mockOAuthProvider = new MockOAuthProvider();
    const mockOAuthConsumer = new MockOAuthConsumer();
    const mockApiClient = new MockThirdPartyApiClient();

    // Set up scenario where third-party token refresh fails
    mockOAuthProvider.setRefreshResult('expired_token_needs_refresh', {
      success: false,
      error: 'Third-party authentication expired and refresh failed',
      errorCode: 'third_party_reauth_required',
    });

    const middleware = createTestMiddleware({}, {
      oauthProvider: mockOAuthProvider as any,
      oauthConsumer: mockOAuthConsumer as any,
      thirdPartyApiClient: mockApiClient,
    });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer expired_token_needs_refresh',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    assertEquals(result.error, 'Third-party authentication expired and refresh failed');
    assertEquals(result.errorCode, 'third_party_reauth_required');
    assertEquals(result.clientId, 'refresh_client');
    assertEquals(result.userId, 'refresh_user');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Create Authentication Context',
  async fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const authResult: AuthenticationResult = {
      authenticated: true,
      clientId: 'test_client',
      userId: 'test_user',
      scope: ['read', 'write'],
    };

    const context = middleware.createAuthContext(authResult, 'req-123');

    assertEquals(context.authenticatedUserId, 'test_user');
    assertEquals(context.clientId, 'test_client');
    assertEquals(context.scopes, ['read', 'write']);
    assertEquals(context.requestId, 'req-123');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Create Context with Unauthenticated Request',
  fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const authResult: AuthenticationResult = {
      authenticated: false,
      error: 'Invalid token',
    };

    try {
      middleware.createAuthContext(authResult, 'req-123');
      assert(false, 'Should have thrown error');
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('Cannot create auth context for unauthenticated request'));
    }
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Error Status Code Mapping',
  fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    // Third-party re-auth required should return 403
    assertEquals(
      middleware.getAuthErrorStatus({
        authenticated: false,
        errorCode: 'third_party_reauth_required',
      }),
      403,
    );

    assertEquals(
      middleware.getAuthErrorStatus({
        authenticated: false,
        errorCode: 'actionstep_reauth_required',
      }),
      403,
    );

    // MCP token expired should return 401
    assertEquals(
      middleware.getAuthErrorStatus({ authenticated: false, errorCode: 'mcp_token_expired' }),
      401,
    );

    // Default should return 401
    assertEquals(
      middleware.getAuthErrorStatus({ authenticated: false }),
      401,
    );
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Client Guidance Messages',
  fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    // Third-party re-auth guidance
    const thirdPartyGuidance = middleware.getClientGuidance('third_party_reauth_required');
    assert(thirdPartyGuidance.includes('browser-based re-authentication'));

    // MCP token expired guidance
    const mcpGuidance = middleware.getClientGuidance('mcp_token_expired');
    assert(mcpGuidance.includes('refresh_token grant'));

    // Default guidance
    const defaultGuidance = middleware.getClientGuidance();
    assert(defaultGuidance.includes('Authentication failed'));
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Add Auth Context to Request Headers',
  fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const originalRequest = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer test_token',
        'Content-Type': 'application/json',
      },
    });

    const authResult: AuthenticationResult = {
      authenticated: true,
      clientId: 'test_client',
      userId: 'test_user',
      scope: ['read', 'write'],
    };

    const authenticatedRequest = middleware.addAuthContextToRequest(originalRequest, authResult);

    // Check that original headers are preserved
    assertEquals(authenticatedRequest.headers.get('Authorization'), 'Bearer test_token');
    assertEquals(authenticatedRequest.headers.get('Content-Type'), 'application/json');

    // Check that auth context headers are added
    assertEquals(authenticatedRequest.headers.get('X-MCP-Client-ID'), 'test_client');
    assertEquals(authenticatedRequest.headers.get('X-MCP-User-ID'), 'test_user');
    assertEquals(authenticatedRequest.headers.get('X-MCP-Scope'), 'read write');
    assertEquals(authenticatedRequest.headers.get('X-MCP-Authenticated'), 'true');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Auth Context Headers with Missing Data',
  fn() {
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const originalRequest = new Request('http://localhost:3000/mcp');

    const authResult: AuthenticationResult = {
      authenticated: true,
      // Missing clientId, userId, scope
    };

    const authenticatedRequest = middleware.addAuthContextToRequest(originalRequest, authResult);

    // Should still mark as authenticated even with missing data
    assertEquals(authenticatedRequest.headers.get('X-MCP-Authenticated'), 'true');

    // Missing headers should not be added
    assertEquals(authenticatedRequest.headers.get('X-MCP-Client-ID'), null);
    assertEquals(authenticatedRequest.headers.get('X-MCP-User-ID'), null);
    assertEquals(authenticatedRequest.headers.get('X-MCP-Scope'), null);
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - MCP Token Only (No Session Binding)',
  async fn() {
    // Test with only OAuth provider, no consumer or API client
    const middleware = createTestMiddleware({}, { oauthProvider: new MockOAuthProvider() as any });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer valid_mcp_token_123',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, true);
    assertEquals(result.clientId, 'test_client_123');
    assertEquals(result.userId, 'test_user_456');
    // No session binding should occur
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Session Binding Without Auto-refresh',
  async fn() {
    const mockOAuthConsumer = new MockOAuthConsumer();
    // No third-party API client = no auto-refresh

    const middleware = createTestMiddleware({}, {
      oauthProvider: new MockOAuthProvider() as any,
      oauthConsumer: mockOAuthConsumer as any,
      thirdPartyApiClient: undefined,
    });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer valid_mcp_token_123',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, true);
    assertEquals(result.clientId, 'test_client_123');
    assertEquals(result.userId, 'test_user_456');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Authentication Service Error Handling',
  async fn() {
    // Create a provider that throws an error
    class ErrorOAuthProvider {
      async validateAccessToken() {
        throw new Error('OAuth service unavailable');
      }

      async authorizeMCPRequest() {
        throw new Error('OAuth service unavailable');
      }

      // Required methods (stubs that throw)
      async handleAuthorizeRequest() {
        throw new Error('Mock method');
      }
      async handleTokenRequest() {
        throw new Error('Mock method');
      }
      async handleClientRegistration() {
        throw new Error('Mock method');
      }
      getAuthorizationServerMetadata() {
        throw new Error('Mock method');
      }
      async validateMCPAccessToken() {
        throw new Error('Mock method');
      }
      async storeMCPAuthRequest() {
        throw new Error('Mock method');
      }
      async getMCPAuthRequest() {
        throw new Error('Mock method');
      }
      async introspectToken() {
        throw new Error('Mock method');
      }
      async generateMCPAuthorizationCode() {
        throw new Error('Mock method');
      }
      async exchangeMCPAuthorizationCode() {
        throw new Error('Mock method');
      }
      async getTokenMapping() {
        throw new Error('Mock method');
      }
    }

    const middleware = createTestMiddleware({}, {
      oauthProvider: new ErrorOAuthProvider() as any,
    });

    const request = new Request('http://localhost:3000/mcp', {
      headers: {
        'Authorization': 'Bearer valid_token',
      },
    });

    const result = await middleware.authenticateRequest(request, 'test-123');

    assertEquals(result.authenticated, false);
    assertEquals(result.error, 'Authentication service error');
  },
});

Deno.test({
  name: 'AuthenticationMiddleware - Configuration Edge Cases',
  fn() {
    // Test with authentication disabled
    const disabledMiddleware = createTestMiddleware({ enabled: false }, {
      oauthProvider: new MockOAuthProvider() as any,
    });
    assert(!disabledMiddleware.isAuthenticationRequired(new URL('http://localhost:3000/mcp')));

    // Test with skip authentication but enabled
    const skipMiddleware = createTestMiddleware({ enabled: true, skipAuthentication: true }, {
      oauthProvider: new MockOAuthProvider() as any,
    });
    assert(!skipMiddleware.isAuthenticationRequired(new URL('http://localhost:3000/mcp')));

    // Test require authentication false
    const noRequireMiddleware = createTestMiddleware({
      enabled: true,
      requireAuthentication: false,
    }, { oauthProvider: new MockOAuthProvider() as any });
    // Should still require auth for MCP endpoints even if requireAuthentication is false
    assert(noRequireMiddleware.isAuthenticationRequired(new URL('http://localhost:3000/mcp')));
  },
});

/**
 * LIBRARY VALIDATION:
 *
 * This test suite validates authentication middleware functionality:
 *
 * ✅ Authentication Detection: Correctly identifies which endpoints require authentication
 * ✅ Bearer Token Validation: Proper extraction and validation of Authorization headers
 * ✅ MCP Token Validation: Integration with OAuth provider for MCP token validation
 * ✅ Session Binding: Validates third-party tokens and handles auto-refresh
 * ✅ Error Handling: Comprehensive error scenarios with proper status codes
 * ✅ Client Guidance: Provides helpful error messages and recovery instructions
 * ✅ Request Context: Creates proper authentication context for downstream processing
 * ✅ Configuration: Handles various configuration scenarios and overrides
 * ✅ MCP Spec Compliance: Follows MCP authorization specification requirements
 *
 * SECURITY COVERAGE:
 * - Token extraction and validation security
 * - Session binding prevents token reuse after third-party expiry
 * - Automatic token refresh maintains session security
 * - Proper error handling prevents information leakage
 * - Authentication bypass protection
 */
