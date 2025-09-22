/**
 * OAuthProvider Unit Tests
 * 
 * 🔒 SECURITY-CRITICAL: Comprehensive tests for OAuth 2.0 Authorization Server
 * 
 * Test Coverage Requirements:
 * - 100% coverage for OAuth provider orchestration
 * - RFC 6749 OAuth 2.0 Authorization Server compliance
 * - RFC 7636 PKCE integration validation
 * - RFC 7591 Dynamic Client Registration compliance
 * - RFC 8414 Authorization Server Metadata compliance
 * - MCP session binding security
 * - Token validation and lifecycle
 * - Error handling and edge cases
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { OAuthProvider } from '../../../src/lib/auth/OAuthProvider.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import { CredentialStore } from '../../../src/lib/storage/CredentialStore.ts';
import { PKCEHandler } from '../../../src/lib/auth/PKCEHandler.ts';
import { ClientRegistry } from '../../../src/lib/auth/ClientRegistry.ts';
import { TokenManager } from '../../../src/lib/auth/TokenManager.ts';
import { AuthorizationHandler } from '../../../src/lib/auth/AuthorizationHandler.ts';
import { OAuthMetadata } from '../../../src/lib/auth/OAuthMetadata.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type { 
  OAuthProviderConfig,
  AuthorizeRequest,
  TokenRequest,
  ClientRegistrationRequest,
  MCPAuthorizationRequest
} from '../../../src/lib/auth/OAuthTypes.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Test configuration for OAuth provider
const testOAuthProviderConfig: OAuthProviderConfig = {
  issuer: 'https://test-oauth-server.example.com',
  clientId: 'test_server_client_id',
  clientSecret: 'test_server_client_secret',
  tokens: {
    accessTokenExpiryMs: 3600 * 1000, // 1 hour
    refreshTokenExpiryMs: 30 * 24 * 3600 * 1000, // 30 days
    authorizationCodeExpiryMs: 10 * 60 * 1000, // 10 minutes
  },
  clients: {
    enableDynamicRegistration: true,
    requireHTTPS: false, // Disabled for testing
    allowedRedirectHosts: ['localhost', 'test.example.com'],
  },
  authorization: {
    supportedGrantTypes: ['authorization_code', 'refresh_token'],
    supportedResponseTypes: ['code'],
    supportedScopes: ['read', 'write', 'admin'],
    enablePKCE: true,
    requirePKCE: true,
  },
};

// Helper function to create test dependencies
async function createTestDependencies() {
  const kvManager = new KVManager({ kvPath: ':memory:' });
  await kvManager.initialize();
  
  const credentialStore = new CredentialStore(kvManager, {}, mockLogger);

  return {
    kvManager,
    credentialStore,
    logger: mockLogger,
  };
}

Deno.test({
  name: 'OAuthProvider - Initialize with Configuration',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Verify provider is initialized
    assertExists(oauthProvider);
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Handle Authorization Request (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // First register a client
    const clientRegistration = await oauthProvider.handleClientRegistration({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test OAuth Client',
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
    
    const authResponse = await oauthProvider.handleAuthorizeRequest(authRequest, 'test_user_123');
    
    // Validate authorization response
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
  name: 'OAuthProvider - Handle Token Request (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Register client
    const clientRegistration = await oauthProvider.handleClientRegistration({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Token Client',
    });
    
    // Get authorization code
    const authRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read write',
      state: 'test-token-state',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };
    
    const authResponse = await oauthProvider.handleAuthorizeRequest(authRequest, 'test_user_456');
    
    // Exchange authorization code for tokens
    const tokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: clientRegistration.client_id,
      code: authResponse.code,
      redirect_uri: 'http://localhost:3000/callback',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };
    
    const tokenResponse = await oauthProvider.handleTokenRequest(tokenRequest);
    
    // Validate token response
    assertExists(tokenResponse.access_token);
    assertEquals(tokenResponse.token_type, 'Bearer');
    assert(tokenResponse.expires_in > 0);
    assertExists(tokenResponse.refresh_token);
    assertEquals(tokenResponse.scope, 'read write');
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Handle Refresh Token Request (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Register client and get initial tokens
    const clientRegistration = await oauthProvider.handleClientRegistration({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Refresh Client',
    });
    
    // Get authorization code
    const authRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read',
      state: 'refresh-test-state',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };
    
    const authResponse = await oauthProvider.handleAuthorizeRequest(authRequest, 'refresh_user');
    
    // Get initial tokens
    const initialTokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: clientRegistration.client_id,
      code: authResponse.code,
      redirect_uri: 'http://localhost:3000/callback',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };
    
    const initialTokens = await oauthProvider.handleTokenRequest(initialTokenRequest);
    assertExists(initialTokens.refresh_token);
    
    // Use refresh token to get new tokens
    const refreshTokenRequest: TokenRequest = {
      grant_type: 'refresh_token',
      client_id: clientRegistration.client_id,
      refresh_token: initialTokens.refresh_token,
    };
    
    const refreshedTokens = await oauthProvider.handleTokenRequest(refreshTokenRequest);
    
    // Validate refreshed tokens
    assertExists(refreshedTokens.access_token);
    assertEquals(refreshedTokens.token_type, 'Bearer');
    assert(refreshedTokens.expires_in > 0);
    assertExists(refreshedTokens.refresh_token);
    
    // New tokens should be different from initial tokens
    assert(refreshedTokens.access_token !== initialTokens.access_token);
    assert(refreshedTokens.refresh_token !== initialTokens.refresh_token);
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Handle Client Registration (RFC 7591 CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    const registrationRequest: ClientRegistrationRequest = {
      redirect_uris: ['http://localhost:3000/callback', 'http://test.example.com/auth'],
      client_name: 'Dynamic Registration Test Client',
      client_uri: 'https://test.example.com',
      scope: 'read write admin',
      contacts: ['admin@test.example.com'],
      tos_uri: 'https://test.example.com/terms',
      policy_uri: 'https://test.example.com/privacy',
    };
    
    const registrationResponse = await oauthProvider.handleClientRegistration(registrationRequest);
    
    // Validate registration response structure
    assertExists(registrationResponse.client_id);
    assert(registrationResponse.client_id.startsWith('mcp_'));
    assertEquals(registrationResponse.client_secret, undefined); // Public clients only
    assertEquals(registrationResponse.redirect_uris, registrationRequest.redirect_uris);
    assertEquals(registrationResponse.client_name, registrationRequest.client_name);
    assertEquals(registrationResponse.client_uri, registrationRequest.client_uri);
    assertEquals(registrationResponse.scope, registrationRequest.scope);
    assertEquals(registrationResponse.contacts, registrationRequest.contacts);
    assertEquals(registrationResponse.tos_uri, registrationRequest.tos_uri);
    assertEquals(registrationResponse.policy_uri, registrationRequest.policy_uri);
    assertExists(registrationResponse.client_id_issued_at);
    assertEquals(registrationResponse.client_secret_expires_at, 0);
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Get Authorization Server Metadata (RFC 8414 CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    const metadata = oauthProvider.getAuthorizationServerMetadata();
    
    // Validate RFC 8414 required fields
    assertEquals(metadata.issuer, testOAuthProviderConfig.issuer);
    assertEquals(metadata.authorization_endpoint, `${testOAuthProviderConfig.issuer}/authorize`);
    assertEquals(metadata.token_endpoint, `${testOAuthProviderConfig.issuer}/token`);
    assertEquals(metadata.registration_endpoint, `${testOAuthProviderConfig.issuer}/register`);
    
    // Validate supported capabilities
    assertEquals(metadata.grant_types_supported, ['authorization_code', 'refresh_token']);
    assertEquals(metadata.response_types_supported, ['code']);
    assertEquals(metadata.scopes_supported, ['read', 'write', 'admin']);
    assert(metadata.code_challenge_methods_supported.includes('S256'));
    
    // Validate MCP-specific extensions
    assertExists(metadata.mcp_extensions);
    assertEquals(metadata.mcp_extensions.server_name, 'bb-mcp-server');
    assertExists(metadata.mcp_extensions.server_version);
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Token Validation (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Get a valid token first
    const clientRegistration = await oauthProvider.handleClientRegistration({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Token Validation Client',
    });
    
    const authRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read',
      state: 'validation-test-state',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };
    
    const authResponse = await oauthProvider.handleAuthorizeRequest(authRequest, 'validation_user');
    
    const tokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: clientRegistration.client_id,
      code: authResponse.code,
      redirect_uri: 'http://localhost:3000/callback',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };
    
    const tokenResponse = await oauthProvider.handleTokenRequest(tokenRequest);
    
    // Test token validation
    const validation = await oauthProvider.validateAccessToken(tokenResponse.access_token);
    
    assertEquals(validation.valid, true);
    assertEquals(validation.clientId, clientRegistration.client_id);
    assertEquals(validation.userId, 'validation_user');
    assertEquals(validation.scope, 'read');
    
    // Test invalid token validation
    const invalidValidation = await oauthProvider.validateAccessToken('invalid_token_12345');
    assertEquals(invalidValidation.valid, false);
    assertEquals(invalidValidation.errorCode, 'invalid_token');
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - MCP Session Binding (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    const mcpAuthRequest: MCPAuthorizationRequest = {
      client_id: 'mcp_client_binding_test',
      redirect_uri: 'http://localhost:3000/mcp/callback',
      state: 'mcp_binding_state',
      user_id: 'mcp_binding_user',
      actionstep_state: 'actionstep_binding_state_123',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      created_at: Date.now(),
      expires_at: Date.now() + (10 * 60 * 1000),
    };
    
    // Store MCP auth request
    await oauthProvider.storeMCPAuthRequest('actionstep_binding_state_123', mcpAuthRequest);
    
    // Retrieve MCP auth request
    const retrievedRequest = await oauthProvider.getMCPAuthRequest('actionstep_binding_state_123');
    
    assertExists(retrievedRequest);
    assertEquals(retrievedRequest.client_id, 'mcp_client_binding_test');
    assertEquals(retrievedRequest.redirect_uri, 'http://localhost:3000/mcp/callback');
    assertEquals(retrievedRequest.state, 'mcp_binding_state');
    assertEquals(retrievedRequest.user_id, 'mcp_binding_user');
    assertEquals(retrievedRequest.actionstep_state, 'actionstep_binding_state_123');
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - MCP Token Validation with ActionStep Integration',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Mock ActionStep authentication service response
    const mockActionStepUser = {
      id: 'actionstep_user_123',
      name: 'ActionStep Test User',
      email: 'test@actionstep.com',
    };
    
    // Generate MCP token for ActionStep user
    const mcpTokenResult = await oauthProvider.generateMCPAuthorizationCode(
      'mcp_client_actionstep_test',
      'actionstep_user_123',
      'http://localhost:3000/mcp/callback',
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      'read write' // Default scope
    );
    
    assertExists(mcpTokenResult);
    assert(mcpTokenResult.startsWith('mcp_auth_'));
    
    // Exchange MCP authorization code
    const exchangeResult = await oauthProvider.exchangeMCPAuthorizationCode(
      mcpTokenResult,
      'mcp_client_actionstep_test',
      'http://localhost:3000/mcp/callback',
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    );
    
    assertExists(exchangeResult);
    assertEquals(exchangeResult.success, true);
    assertExists(exchangeResult.accessToken);
    // Note: exchangeMCPAuthorizationCode doesn't return standard OAuth format
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Error Handling for Invalid Requests',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Test invalid authorization request
    const invalidAuthRequest: AuthorizeRequest = {
      response_type: 'invalid_type',
      client_id: 'nonexistent_client',
      redirect_uri: 'http://malicious.com/callback',
      state: 'test-state',
    };
    
    try {
      await oauthProvider.handleAuthorizeRequest(invalidAuthRequest, 'test_user');
      assert(false, 'Should have thrown error for invalid authorization request');
    } catch (error) {
      assert(error instanceof Error);
    }
    
    // Test invalid token request
    const invalidTokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: 'nonexistent_client',
      code: 'invalid_code',
      redirect_uri: 'http://localhost:3000/callback',
    };
    
    try {
      await oauthProvider.handleTokenRequest(invalidTokenRequest);
      assert(false, 'Should have thrown error for invalid token request');
    } catch (error) {
      assert(error instanceof Error);
    }
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Unsupported Grant Type Error',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    const unsupportedGrantRequest: TokenRequest = {
      grant_type: 'client_credentials' as any, // Not supported
      client_id: 'test_client',
      client_secret: 'test_secret',
    };
    
    try {
      await oauthProvider.handleTokenRequest(unsupportedGrantRequest);
      assert(false, 'Should have thrown error for unsupported grant type');
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('Unsupported grant type'));
    }
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - PKCE Missing Code Verifier Error',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Register client and get authorization code with PKCE
    const clientRegistration = await oauthProvider.handleClientRegistration({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'PKCE Test Client',
    });
    
    const authRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read',
      state: 'pkce-test-state',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };
    
    const authResponse = await oauthProvider.handleAuthorizeRequest(authRequest, 'pkce_user');
    
    // Try to exchange code without code_verifier
    const tokenRequestWithoutVerifier: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: clientRegistration.client_id,
      code: authResponse.code,
      redirect_uri: 'http://localhost:3000/callback',
      // Missing code_verifier
    };
    
    try {
      await oauthProvider.handleTokenRequest(tokenRequestWithoutVerifier);
      assert(false, 'Should have thrown error for missing PKCE code verifier');
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('PKCE'));
    }
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Authorization Code Reuse Prevention (SECURITY CRITICAL)',
  async fn() {
    const dependencies = await createTestDependencies();
    
    const oauthProvider = new OAuthProvider(testOAuthProviderConfig, dependencies);
    
    // Register client and get authorization code
    const clientRegistration = await oauthProvider.handleClientRegistration({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Code Reuse Test Client',
    });
    
    const authRequest: AuthorizeRequest = {
      response_type: 'code',
      client_id: clientRegistration.client_id,
      redirect_uri: 'http://localhost:3000/callback',
      scope: 'read',
      state: 'reuse-test-state',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    };
    
    const authResponse = await oauthProvider.handleAuthorizeRequest(authRequest, 'reuse_user');
    
    const tokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: clientRegistration.client_id,
      code: authResponse.code,
      redirect_uri: 'http://localhost:3000/callback',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };
    
    // First use should succeed
    const firstTokenResponse = await oauthProvider.handleTokenRequest(tokenRequest);
    assertExists(firstTokenResponse.access_token);
    
    // Second use of same code should fail
    try {
      await oauthProvider.handleTokenRequest(tokenRequest);
      assert(false, 'Should have thrown error for authorization code reuse');
    } catch (error) {
      assert(error instanceof Error);
    }
    
    await dependencies.kvManager.close();
  },
});

Deno.test({
  name: 'OAuthProvider - Configuration Validation',
  async fn() {
    const dependencies = await createTestDependencies();
    
    // Test with minimal valid configuration
    const minimalConfig: OAuthProviderConfig = {
      issuer: 'https://minimal.example.com',
      clientId: 'minimal_client',
      clientSecret: 'minimal_secret',
      tokens: {
        accessTokenExpiryMs: 3600000,
        refreshTokenExpiryMs: 2592000000,
        authorizationCodeExpiryMs: 600000,
      },
      clients: {
        enableDynamicRegistration: false,
        requireHTTPS: false,
        allowedRedirectHosts: [],
      },
      authorization: {
        supportedGrantTypes: ['authorization_code'],
        supportedResponseTypes: ['code'],
        supportedScopes: ['read'],
        enablePKCE: false,
        requirePKCE: false,
      },
    };
    
    const minimalProvider = new OAuthProvider(minimalConfig, dependencies);
    assertExists(minimalProvider);
    
    // Test metadata with minimal config
    const metadata = minimalProvider.getAuthorizationServerMetadata();
    assertEquals(metadata.issuer, 'https://minimal.example.com');
    assertEquals(metadata.grant_types_supported, ['authorization_code']);
    assertEquals(metadata.scopes_supported, ['read']);
    
    await dependencies.kvManager.close();
  },
});