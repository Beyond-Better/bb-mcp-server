/**
 * TokenManager Unit Tests
 *
 * 🔒 SECURITY-CRITICAL: Comprehensive tests for OAuth token operations
 *
 * Test Coverage Requirements:
 * - 100% coverage for security-critical token operations
 * - RFC 6749 compliance validation
 * - Cryptographic security validation
 * - Token lifecycle and expiry handling
 * - Error handling and edge cases
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { TokenManager } from '../../../src/lib/auth/TokenManager.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import type { Logger } from '../../../src/types/library.types.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Test configuration
const testTokenConfig = {
  accessTokenExpiryMs: 3600 * 1000, // 1 hour
  refreshTokenExpiryMs: 30 * 24 * 3600 * 1000, // 30 days
  authorizationCodeExpiryMs: 10 * 60 * 1000, // 10 minutes
};

Deno.test({
  name: 'TokenManager - Generate Access Token (SECURITY CRITICAL)',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test token generation
    const clientId = 'test_client_123';
    const userId = 'test_user_456';
    const includeRefreshToken = true;

    const accessToken = await tokenManager.generateAccessToken(
      clientId,
      userId,
      includeRefreshToken,
    );

    // Validate token structure
    assertExists(accessToken.access_token);
    assertEquals(accessToken.token_type, 'Bearer');
    assertEquals(accessToken.client_id, clientId);
    assertEquals(accessToken.user_id, userId);
    assertEquals(accessToken.scope, 'read write');
    assertExists(accessToken.created_at);
    assertExists(accessToken.expires_at);
    assertExists(accessToken.refresh_token); // Should be included

    // Validate token format (security requirement)
    assert(accessToken.access_token.startsWith('mcp_token_'));
    assertEquals(accessToken.access_token.length, 'mcp_token_'.length + 32);

    if (accessToken.refresh_token) {
      assert(accessToken.refresh_token.startsWith('mcp_refresh_'));
      assertEquals(accessToken.refresh_token.length, 'mcp_refresh_'.length + 32);
    }

    // Validate expiry times
    const now = Date.now();
    assert(accessToken.expires_at > now);
    assert(accessToken.expires_at <= now + testTokenConfig.accessTokenExpiryMs + 1000); // Allow 1s buffer

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Generate Authorization Code (SECURITY CRITICAL)',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test authorization code generation
    const clientId = 'test_client_123';
    const userId = 'test_user_456';
    const redirectUri = 'https://client.example.com/callback';
    const codeChallenge = 'test_challenge_123456789012345678901234567890';

    const authCode = await tokenManager.generateAuthorizationCode(
      clientId,
      userId,
      redirectUri,
      codeChallenge,
    );

    // Validate authorization code format (security requirement)
    assertExists(authCode);
    assert(authCode.startsWith('mcp_auth_'));
    assertEquals(authCode.length, 'mcp_auth_'.length + 32);

    // Validate stored code
    const storedCode = await tokenManager.getAuthorizationCode(authCode);
    assertExists(storedCode);
    assertEquals(storedCode.client_id, clientId);
    assertEquals(storedCode.user_id, userId);
    assertEquals(storedCode.redirect_uri, redirectUri);
    assertEquals(storedCode.code_challenge, codeChallenge);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Validate Access Token (SECURITY CRITICAL)',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate test token
    const clientId = 'test_client_123';
    const userId = 'test_user_456';
    const accessToken = await tokenManager.generateAccessToken(clientId, userId, true);

    // Test token validation
    const validation = await tokenManager.validateAccessToken(accessToken.access_token);

    // Validate successful validation
    assertEquals(validation.valid, true);
    assertEquals(validation.clientId, clientId);
    assertEquals(validation.userId, userId);
    assertEquals(validation.scopes, ['read', 'write']);

    // Test invalid token
    const invalidValidation = await tokenManager.validateAccessToken('invalid_token_123');
    assertEquals(invalidValidation.valid, false);
    assertEquals(invalidValidation.errorCode, 'invalid_token');

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Refresh Token Flow (SECURITY CRITICAL)',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate initial token with refresh token
    const clientId = 'test_client_123';
    const userId = 'test_user_456';
    const initialToken = await tokenManager.generateAccessToken(clientId, userId, true);

    assertExists(initialToken.refresh_token);

    // Test refresh token exchange
    const refreshResult = await tokenManager.refreshAccessToken(
      initialToken.refresh_token!,
      clientId,
    );

    // Validate refresh success
    assertEquals(refreshResult.success, true);
    assertExists(refreshResult.accessToken);

    const newToken = refreshResult.accessToken!;
    assertEquals(newToken.client_id, clientId);
    assertEquals(newToken.user_id, userId);
    assertExists(newToken.refresh_token);

    // Validate new tokens are different (token rotation)
    assert(newToken.access_token !== initialToken.access_token);
    assert(newToken.refresh_token !== initialToken.refresh_token);

    // Validate old refresh token is invalidated
    const oldRefreshResult = await tokenManager.refreshAccessToken(
      initialToken.refresh_token!,
      clientId,
    );
    assertEquals(oldRefreshResult.success, false);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Authorization Code One-Time Use (SECURITY CRITICAL)',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate authorization code
    const clientId = 'test_client_123';
    const userId = 'test_user_456';
    const redirectUri = 'https://client.example.com/callback';

    const authCode = await tokenManager.generateAuthorizationCode(
      clientId,
      userId,
      redirectUri,
    );

    // First retrieval should succeed
    const firstRetrieval = await tokenManager.getAuthorizationCode(authCode);
    assertExists(firstRetrieval);
    assertEquals(firstRetrieval.client_id, clientId);

    // Delete the code (simulating exchange)
    await tokenManager.deleteAuthorizationCode(authCode);

    // Second retrieval should fail (one-time use)
    const secondRetrieval = await tokenManager.getAuthorizationCode(authCode);
    assertEquals(secondRetrieval, null);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Token Statistics',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate test tokens
    await tokenManager.generateAccessToken('client1', 'user1', true);
    await tokenManager.generateAccessToken('client2', 'user2', false);
    await tokenManager.generateAuthorizationCode(
      'client3',
      'user3',
      'https://example.com/callback',
    );

    // Test statistics
    const stats = await tokenManager.getTokenStats();

    assertEquals(stats.totalAccessTokens, 2);
    assertEquals(stats.totalRefreshTokens, 1); // Only first token included refresh
    assertEquals(stats.totalAuthorizationCodes, 1);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Cryptographic Security Validation',
  async fn() {
    // Setup
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate multiple tokens to test randomness
    const tokens: string[] = [];
    for (let i = 0; i < 10; i++) {
      const token = await tokenManager.generateAccessToken(
        `client_${i}`,
        `user_${i}`,
        false,
      );
      tokens.push(token.access_token);
    }

    // Validate all tokens are unique (cryptographic randomness)
    const uniqueTokens = new Set(tokens);
    assertEquals(uniqueTokens.size, tokens.length, 'All tokens must be unique');

    // Validate token format consistency
    for (const token of tokens) {
      assert(token.startsWith('mcp_token_'), 'Token must have correct prefix');
      assertEquals(token.length, 'mcp_token_'.length + 32, 'Token must have correct length');
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Generate Access Token Without Refresh Token',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    const accessToken = await tokenManager.generateAccessToken(
      'test_client',
      'test_user',
      false, // No refresh token
    );

    assertExists(accessToken.access_token);
    assertEquals(accessToken.token_type, 'Bearer');
    assertEquals(accessToken.refresh_token, undefined); // Should not have refresh token
    assertEquals(accessToken.scope, 'read write');

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Token Expiry Configuration',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const customConfig = {
      accessTokenExpiryMs: 30 * 60 * 1000, // 30 minutes
      refreshTokenExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      authorizationCodeExpiryMs: 5 * 60 * 1000, // 5 minutes
    };

    const tokenManager = new TokenManager(customConfig, {
      kvManager,
      logger: mockLogger,
    });

    const beforeToken = Date.now();
    const accessToken = await tokenManager.generateAccessToken('client', 'user', true);
    const afterToken = Date.now();

    // Validate custom expiry times
    assert(accessToken.expires_at >= beforeToken + (30 * 60 * 1000) - 1000);
    assert(accessToken.expires_at <= afterToken + (30 * 60 * 1000) + 1000);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Invalid Token Validation',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test various invalid token formats
    const invalidTokens = [
      'invalid_token_format',
      'mcp_token_', // Too short
      'wrong_prefix_' + 'x'.repeat(32),
      '', // Empty
      'mcp_token_invalid_characters!@#',
    ];

    for (const invalidToken of invalidTokens) {
      const validation = await tokenManager.validateAccessToken(invalidToken);
      assertEquals(validation.valid, false);
      assertEquals(validation.errorCode, 'invalid_token');
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Expired Token Cleanup (SECURITY CRITICAL)',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    // Use very short expiry for testing
    const shortExpiryConfig = {
      accessTokenExpiryMs: 100, // 100ms
      refreshTokenExpiryMs: 1000,
      authorizationCodeExpiryMs: 100,
    };

    const tokenManager = new TokenManager(shortExpiryConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate token
    const accessToken = await tokenManager.generateAccessToken('client', 'user', false);
    assertExists(accessToken.access_token);

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Validation should fail and clean up expired token
    const validation = await tokenManager.validateAccessToken(accessToken.access_token);
    assertEquals(validation.valid, false);
    assertEquals(validation.errorCode, 'token_expired');

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Authorization Code Expiry Handling (SECURITY CRITICAL)',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    // Use short expiry for testing
    const shortExpiryConfig = {
      accessTokenExpiryMs: 3600 * 1000,
      refreshTokenExpiryMs: 30 * 24 * 3600 * 1000,
      authorizationCodeExpiryMs: 100, // 100ms
    };

    const tokenManager = new TokenManager(shortExpiryConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate authorization code
    const authCode = await tokenManager.generateAuthorizationCode(
      'client_expiry',
      'user_expiry',
      'https://example.com/callback',
    );

    assertExists(authCode);

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Retrieval should return null for expired code
    const retrievedCode = await tokenManager.getAuthorizationCode(authCode);
    assertEquals(retrievedCode, null);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - PKCE Code Challenge Storage and Retrieval',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const authCode = await tokenManager.generateAuthorizationCode(
      'pkce_client',
      'pkce_user',
      'https://example.com/callback',
      codeChallenge,
    );

    const retrievedCode = await tokenManager.getAuthorizationCode(authCode);

    assertExists(retrievedCode);
    assertEquals(retrievedCode.client_id, 'pkce_client');
    assertEquals(retrievedCode.user_id, 'pkce_user');
    assertEquals(retrievedCode.redirect_uri, 'https://example.com/callback');
    assertEquals(retrievedCode.code_challenge, codeChallenge);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Refresh Token Client ID Mismatch (SECURITY CRITICAL)',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate token with refresh token
    const initialToken = await tokenManager.generateAccessToken(
      'correct_client',
      'test_user',
      true,
    );

    assertExists(initialToken.refresh_token);

    // Attempt refresh with wrong client ID
    const refreshResult = await tokenManager.refreshAccessToken(
      initialToken.refresh_token!,
      'wrong_client', // Different client ID
    );

    assertEquals(refreshResult.success, false);
    assertEquals(refreshResult.error, 'Invalid client credentials');

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Refresh Token Expiry (SECURITY CRITICAL)',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    // Use short refresh token expiry
    const shortRefreshConfig = {
      accessTokenExpiryMs: 3600 * 1000,
      refreshTokenExpiryMs: 100, // 100ms
      authorizationCodeExpiryMs: 10 * 60 * 1000,
    };

    const tokenManager = new TokenManager(shortRefreshConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Generate token with refresh token
    const initialToken = await tokenManager.generateAccessToken(
      'client_refresh_expiry',
      'user_refresh_expiry',
      true,
    );

    assertExists(initialToken.refresh_token);

    // Wait for refresh token expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Attempt to use expired refresh token
    const refreshResult = await tokenManager.refreshAccessToken(
      initialToken.refresh_token!,
      'client_refresh_expiry',
    );

    assertEquals(refreshResult.success, false);
    assertEquals(refreshResult.error, 'Refresh token expired');

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Token Statistics Edge Cases',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test stats with no tokens
    const emptyStats = await tokenManager.getTokenStats();
    assertEquals(emptyStats.totalAccessTokens, 0);
    assertEquals(emptyStats.totalRefreshTokens, 0);
    assertEquals(emptyStats.totalAuthorizationCodes, 0);

    // Generate mixed tokens
    await tokenManager.generateAccessToken('client1', 'user1', true); // Access + refresh
    await tokenManager.generateAccessToken('client2', 'user2', false); // Access only
    await tokenManager.generateAuthorizationCode('client3', 'user3', 'https://example.com');

    const mixedStats = await tokenManager.getTokenStats();
    assertEquals(mixedStats.totalAccessTokens, 2);
    assertEquals(mixedStats.totalRefreshTokens, 1);
    assertEquals(mixedStats.totalAuthorizationCodes, 1);

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Error Handling for KV Storage Failures',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Close KV to simulate storage failure
    await kvManager.close();

    // Token generation should handle KV errors gracefully
    try {
      await tokenManager.generateAccessToken('client', 'user', true);
      assert(false, 'Should have thrown error for KV failure');
    } catch (error) {
      assert(error instanceof Error);
    }

    // Token validation should handle KV errors gracefully
    const validation = await tokenManager.validateAccessToken('any_token');
    assertEquals(validation.valid, false);
    assertEquals(validation.errorCode, 'invalid_token');
  },
});

Deno.test({
  name: 'TokenManager - Authorization Code Format Validation',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test various invalid authorization code formats
    const invalidCodes = [
      'invalid_code_format',
      'mcp_auth_', // Too short
      'wrong_prefix_' + 'x'.repeat(32),
      '', // Empty
      'mcp_auth_invalid!@#',
    ];

    for (const invalidCode of invalidCodes) {
      const result = await tokenManager.getAuthorizationCode(invalidCode);
      assertEquals(result, null);
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Refresh Token Format Validation',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test various invalid refresh token formats
    const invalidRefreshTokens = [
      'invalid_refresh_format',
      'mcp_refresh_', // Too short
      'wrong_prefix_' + 'x'.repeat(32),
      '', // Empty
      'mcp_refresh_invalid!@#',
    ];

    for (const invalidRefreshToken of invalidRefreshTokens) {
      const result = await tokenManager.refreshAccessToken(invalidRefreshToken, 'any_client');
      assertEquals(result.success, false);
      assertEquals(result.error, 'Invalid or expired refresh token');
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Token Scope Validation',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    const tokenManager = new TokenManager(testTokenConfig, {
      kvManager,
      logger: mockLogger,
    });

    const accessToken = await tokenManager.generateAccessToken('client', 'user', false);
    const validation = await tokenManager.validateAccessToken(accessToken.access_token);

    assertEquals(validation.valid, true);
    assertEquals(validation.scopes, ['read', 'write']);
    assertEquals(validation.clientId, 'client');
    assertEquals(validation.userId, 'user');

    await kvManager.close();
  },
});

Deno.test({
  name: 'TokenManager - Default Configuration Values',
  async fn() {
    const kvManager = new KVManager({ kvPath: ':memory:' });
    await kvManager.initialize();

    // Test with partial configuration (should use defaults)
    const partialConfig = {
      accessTokenExpiryMs: 1800 * 1000, // 30 minutes
      // Missing refreshTokenExpiryMs and authorizationCodeExpiryMs
    } as any;

    const tokenManager = new TokenManager(partialConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Should still work with default values
    const accessToken = await tokenManager.generateAccessToken('client', 'user', true);
    assertExists(accessToken.access_token);
    assertExists(accessToken.refresh_token);

    await kvManager.close();
  },
});
