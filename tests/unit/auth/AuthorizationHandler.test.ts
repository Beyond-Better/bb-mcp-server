/**
 * AuthorizationHandler Unit Tests
 *
 * 🔒 SECURITY-CRITICAL: Comprehensive tests for OAuth authorization code flow
 *
 * Test Coverage Requirements:
 * - 100% coverage for security-critical authorization operations
 * - RFC 6749 Authorization Code Grant flow compliance
 * - RFC 7636 PKCE integration validation
 * - MCP session binding security
 * - State parameter CSRF protection
 * - Error handling and edge cases
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { AuthorizationHandler } from '../../../src/lib/auth/AuthorizationHandler.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import { PKCEHandler } from '../../../src/lib/auth/PKCEHandler.ts';
import { ClientRegistry } from '../../../src/lib/auth/ClientRegistry.ts';
import { TokenManager } from '../../../src/lib/auth/TokenManager.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type {
  AuthorizationConfig,
  AuthorizeRequest,
  MCPAuthorizationRequest,
} from '../../../src/lib/auth/OAuthTypes.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Test configuration
const testAuthConfig: AuthorizationConfig = {
  supportedGrantTypes: ['authorization_code', 'refresh_token'],
  supportedResponseTypes: ['code'],
  supportedScopes: ['read', 'write'],
  enablePKCE: true,
  requirePKCE: true,
  issuer: 'https://test-oauth-server.example.com',
};

// Helper function to create test dependencies
async function createTestDependencies() {
  const kvManager = new KVManager({ kvPath: ':memory:' });
  await kvManager.initialize();

  const pkceHandler = new PKCEHandler(mockLogger);

  const clientRegistry = new ClientRegistry(
    {
      enableDynamicRegistration: true,
      requireHTTPS: false, // Disable for testing
      allowedRedirectHosts: ['localhost', 'test.example.com'],
    },
    { kvManager, logger: mockLogger },
  );

  const tokenManager = new TokenManager(
    {
      accessTokenExpiryMs: 3600 * 1000,
      refreshTokenExpiryMs: 30 * 24 * 3600 * 1000,
      authorizationCodeExpiryMs: 10 * 60 * 1000,
    },
    { kvManager, logger: mockLogger },
  );

  return {
    kvManager,
    pkceHandler,
    clientRegistry,
    tokenManager,
  };
}

Deno.test({
  name: 'AuthorizationHandler - Initialize with Configuration',
  async fn() {
    const dependencies = await createTestDependencies();

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Verify handler is initialized
    assertExists(authHandler);

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Validate Authorization Request (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register a test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Test valid authorization request
    const validRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read write',
      state: 'test-state-123',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };

    const validation = await authHandler.validateAuthorizationRequest(validRequest);

    assertEquals(validation.valid, true);
    assertEquals(validation.clientId, clientRegistration.client_id);
    assertEquals(validation.redirectUri, 'http://localhost:3000/callback');
    assertEquals(validation.scopes, ['read', 'write']);
    assertEquals(validation.codeChallenge, validRequest.code_challenge);

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Reject Invalid Response Type (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    const invalidRequest: AuthorizeRequest = {
      response_type: 'token', // Invalid response type
      client_id: 'test_client',
      redirect_uri: 'http://localhost:3000/callback',
      state: 'test-state-123',
    };

    const validation = await authHandler.validateAuthorizationRequest(invalidRequest);

    assertEquals(validation.valid, false);
    assertEquals(validation.error, 'Unsupported response type: token');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Require PKCE for Security (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Request without PKCE should fail when PKCE is required
    const noPKCERequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read',
      state: 'test-state-123',
    };

    const validation = await authHandler.validateAuthorizationRequest(noPKCERequest);

    assertEquals(validation.valid, false);
    assertEquals(validation.error, 'PKCE required for this client');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Validate Scopes (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Request with invalid scope
    const invalidScopeRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'invalid_scope',
      state: 'test-state-123',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
    };

    const validation = await authHandler.validateAuthorizationRequest(invalidScopeRequest);

    assertEquals(validation.valid, false);
    assertEquals(validation.error, 'Unsupported scope: invalid_scope');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Require State Parameter (CSRF PROTECTION)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Request without state parameter should fail
    const noStateRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
    };

    const validation = await authHandler.validateAuthorizationRequest(noStateRequest);

    assertEquals(validation.valid, false);
    assertEquals(validation.error, 'State parameter is required');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Handle Authorization Request (COMPLETE FLOW)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    const authRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read write',
      state: 'test-state-456',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };

    const authResponse = await authHandler.handleAuthorizeRequest(authRequest, 'test_user_123');

    // Validate response
    assertExists(authResponse.code);
    assertEquals(authResponse.state, 'test-state-456');
    assertExists(authResponse.redirectUrl);

    // Verify redirect URL contains code and state
    const redirectUrl = new URL(authResponse.redirectUrl);
    assertEquals(redirectUrl.searchParams.get('code'), authResponse.code);
    assertEquals(redirectUrl.searchParams.get('state'), 'test-state-456');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Exchange Authorization Code (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Generate authorization code
    const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    const authCode = await dependencies.tokenManager.generateAuthorizationCode(
      clientRegistration.client_id,
      'test_user_123',
      'http://localhost:3000/callback',
      codeChallenge,
    );

    // Test successful code exchange
    const exchangeResult = await authHandler.exchangeAuthorizationCode(
      authCode,
      clientRegistration.client_id,
      'http://localhost:3000/callback',
      codeVerifier,
    );

    assertEquals(exchangeResult.success, true);

    // Verify code is consumed (one-time use)
    const secondExchange = await authHandler.exchangeAuthorizationCode(
      authCode,
      clientRegistration.client_id,
      'http://localhost:3000/callback',
      codeVerifier,
    );

    assertEquals(secondExchange.success, false);
    assertEquals(secondExchange.error, 'Invalid or expired authorization code');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - PKCE Validation in Code Exchange (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Generate authorization code with PKCE
    const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const authCode = await dependencies.tokenManager.generateAuthorizationCode(
      clientRegistration.client_id,
      'test_user_123',
      'http://localhost:3000/callback',
      codeChallenge,
    );

    // Test with wrong code verifier
    const wrongVerifierResult = await authHandler.exchangeAuthorizationCode(
      authCode,
      clientRegistration.client_id,
      'http://localhost:3000/callback',
      'wrong-code-verifier-that-should-fail',
    );

    assertEquals(wrongVerifierResult.success, false);
    assertEquals(wrongVerifierResult.error, 'Invalid PKCE code verifier');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Client ID Validation (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    // Register test client
    const clientRegistration = await dependencies.clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Generate authorization code
    const authCode = await dependencies.tokenManager.generateAuthorizationCode(
      clientRegistration.client_id,
      'test_user_123',
      'http://localhost:3000/callback',
    );

    // Test with wrong client ID
    const wrongClientResult = await authHandler.exchangeAuthorizationCode(
      authCode,
      'wrong_client_id',
      'http://localhost:3000/callback',
    );

    assertEquals(wrongClientResult.success, false);
    assertEquals(wrongClientResult.error, 'Invalid client credentials');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - MCP Authorization Request Storage (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    const mcpAuthRequest: MCPAuthorizationRequest = {
      client_id: 'mcp_test_client_123',
      redirect_uri: 'http://localhost:3000/mcp/callback',
      state: 'mcp_state_456',
      user_id: 'mcp_user_789',
      actionstep_state: 'actionstep_state_abc',
      code_challenge: 'test_code_challenge_def',
      created_at: Date.now(),
      expires_at: Date.now() + (10 * 60 * 1000), // 10 minutes
    };

    // Store MCP auth request
    await authHandler.storeMCPAuthRequest('actionstep_state_abc', mcpAuthRequest);

    // Retrieve MCP auth request
    const retrievedRequest = await authHandler.getMCPAuthRequest('actionstep_state_abc');

    assertExists(retrievedRequest);
    assertEquals(retrievedRequest.client_id, 'mcp_test_client_123');
    assertEquals(retrievedRequest.redirect_uri, 'http://localhost:3000/mcp/callback');
    assertEquals(retrievedRequest.state, 'mcp_state_456');
    assertEquals(retrievedRequest.user_id, 'mcp_user_789');
    assertEquals(retrievedRequest.actionstep_state, 'actionstep_state_abc');
    assertEquals(retrievedRequest.code_challenge, 'test_code_challenge_def');

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - MCP Authorization Request Expiry (SECURITY)',
  async fn() {
    const dependencies = await createTestDependencies();

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    // Create expired MCP auth request
    const expiredMcpRequest: MCPAuthorizationRequest = {
      client_id: 'mcp_test_client_123',
      redirect_uri: 'http://localhost:3000/mcp/callback',
      state: 'mcp_state_456',
      user_id: 'mcp_user_789',
      actionstep_state: 'actionstep_state_expired',
      created_at: Date.now() - (20 * 60 * 1000), // 20 minutes ago
      expires_at: Date.now() - (10 * 60 * 1000), // Expired 10 minutes ago
    };

    // Store expired request
    await authHandler.storeMCPAuthRequest('actionstep_state_expired', expiredMcpRequest);

    // Try to retrieve expired request
    const retrievedRequest = await authHandler.getMCPAuthRequest('actionstep_state_expired');

    // Should return null for expired request
    assertEquals(retrievedRequest, null);

    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'AuthorizationHandler - Authorization State Management',
  async fn() {
    const dependencies = await createTestDependencies();

    const authHandler = new AuthorizationHandler(testAuthConfig, {
      ...dependencies,
      logger: mockLogger,
    });

    const authState = {
      client_id: 'test_client_123',
      redirect_uri: 'http://localhost:3000/callback',
      state: 'client_state_456',
      mcp_client_id: 'mcp_client_789',
      mcp_redirect_uri: 'http://localhost:3000/mcp/callback',
      upstream_state: 'upstream_state_abc',
      code_challenge: 'test_code_challenge',
      code_challenge_method: 'S256',
      created_at: Date.now(),
      expires_at: Date.now() + (10 * 60 * 1000),
    };

    // Store authorization state
    await authHandler.storeAuthorizationState('test_state_key', authState);

    // Retrieve authorization state
    const retrievedState = await authHandler.getAuthorizationState('test_state_key');

    assertExists(retrievedState);
    assertEquals(retrievedState.client_id, 'test_client_123');
    assertEquals(retrievedState.redirect_uri, 'http://localhost:3000/callback');
    assertEquals(retrievedState.mcp_client_id, 'mcp_client_789');
    assertEquals(retrievedState.upstream_state, 'upstream_state_abc');

    await dependencies.kvManager.close();
  },
});
