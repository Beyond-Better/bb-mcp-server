/**
 * ClientRegistry Unit Tests
 * 
 * 🔒 SECURITY-CRITICAL: Comprehensive tests for OAuth client management
 * 
 * Test Coverage Requirements:
 * - 100% coverage for security-critical client operations
 * - RFC 7591 Dynamic Client Registration compliance
 * - Client validation and security checks
 * - Redirect URI validation and security
 * - Client credential security and generation
 * - Error handling and edge cases
 */

import { assertEquals, assertExists, assert } from '@std/assert';
import { ClientRegistry } from '../../../src/lib/auth/ClientRegistry.ts';
import { KVManager } from '../../../src/lib/storage/KVManager.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type { 
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  OAuthClient 
} from '../../../src/lib/auth/OAuthTypes.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Test configuration for secure client registry
const testClientConfig = {
  enableDynamicRegistration: true,
  requireHTTPS: false, // Disabled for testing
  allowedRedirectHosts: ['localhost', 'test.example.com', '127.0.0.1'],
};

// Helper function to create test dependencies
async function createTestDependencies() {
  const kvManager = new KVManager({ kvPath: ':memory:' });
  await kvManager.initialize();

  return { kvManager };
}

Deno.test({
  name: 'ClientRegistry - Initialize with Configuration',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Verify registry is initialized
    assertExists(clientRegistry);

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Register Client (RFC 7591 CRITICAL)',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    const registrationRequest: ClientRegistrationRequest = {
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test OAuth Client',
      client_uri: 'https://test.example.com',
      scope: 'read write',
    };

    const registration = await clientRegistry.registerClient(registrationRequest);

    // Validate registration response
    assertExists(registration.client_id);
    assert(registration.client_id.startsWith('mcp_'), 'Client ID should have mcp_ prefix');
    assertEquals(registration.client_id.length, 'mcp_'.length + 16, 'Client ID should be correct length');
    
    // Public clients should not have client_secret (PKCE-only)
    assertEquals(registration.client_secret, undefined, 'Public clients should not have client_secret');
    
    assertEquals(registration.redirect_uris, ['http://localhost:3000/callback']);
    assertEquals(registration.client_name, 'Test OAuth Client');
    assertEquals(registration.client_uri, 'https://test.example.com');
    
    // Validate timestamps
    assertExists(registration.client_id_issued_at);
    assert(registration.client_id_issued_at <= Date.now(), 'Issue timestamp should be in the past');

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Validate Client Existence (SECURITY CRITICAL)',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register a test client
    const registration = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
    });

    // Test valid client validation
    const validResult = await clientRegistry.validateClient(
      registration.client_id,
      'http://localhost:3000/callback'
    );

    assertEquals(validResult.valid, true);
    assertEquals(validResult.clientId, registration.client_id);
    assertEquals(validResult.redirectUris, ['http://localhost:3000/callback']);

    // Test invalid client validation
    const invalidResult = await clientRegistry.validateClient(
      'invalid_client_id',
      'http://localhost:3000/callback'
    );

    assertEquals(invalidResult.valid, false);
    assertEquals(invalidResult.error, 'Client not found');

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Redirect URI Validation (SECURITY CRITICAL)',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register client with specific redirect URI
    const registration = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback', 'http://localhost:3000/auth'],
      client_name: 'Test Client',
    });

    // Test valid redirect URI
    const validRedirectResult = await clientRegistry.validateClient(
      registration.client_id,
      'http://localhost:3000/callback'
    );
    assertEquals(validRedirectResult.valid, true);

    // Test second valid redirect URI
    const validRedirectResult2 = await clientRegistry.validateClient(
      registration.client_id,
      'http://localhost:3000/auth'
    );
    assertEquals(validRedirectResult2.valid, true);

    // Test invalid redirect URI
    const invalidRedirectResult = await clientRegistry.validateClient(
      registration.client_id,
      'http://localhost:3000/malicious'
    );
    assertEquals(invalidRedirectResult.valid, false);
    assertEquals(invalidRedirectResult.error, 'Invalid redirect URI for client');

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Validate Redirect URI Host Security (SECURITY CRITICAL)',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    // Create registry with strict host validation
    const strictClientRegistry = new ClientRegistry(
      {
        enableDynamicRegistration: true,
        requireHTTPS: false, // For testing
        allowedRedirectHosts: ['localhost'], // Only localhost allowed
      },
      { kvManager, logger: mockLogger }
    );

    // Test registration with allowed host
    const validRegistration = await strictClientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Valid Client',
    });
    assertExists(validRegistration.client_id);

    // Test registration with disallowed host should fail
    try {
      await strictClientRegistry.registerClient({
        redirect_uris: ['http://malicious.example.com/callback'],
        client_name: 'Malicious Client',
      });
      assert(false, 'Should have thrown error for disallowed host');
    } catch (error) {
      assert(error instanceof Error);
      assert(
        error.message.includes('not allowed') || error.message.includes('HTTPS requirement'), 
        `Error should mention host not allowed or HTTPS requirement. Got: ${error.message}`
      );
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Get Client Information',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register a client
    const registration = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Test Client',
      client_uri: 'https://test.example.com',
      scope: 'read write',
    });

    // Get client information
    const client = await clientRegistry.getClient(registration.client_id);

    assertExists(client);
    assertEquals(client.client_id, registration.client_id);
    assertEquals(client.client_name, 'Test Client');
    assertEquals(client.redirect_uris, ['http://localhost:3000/callback']);
    assertEquals(client.client_uri, 'https://test.example.com');
    assertEquals(client.scope, 'read write');
    assertExists(client.client_id_issued_at);

    // Test non-existent client
    const nonExistentClient = await clientRegistry.getClient('nonexistent_client_id');
    assertEquals(nonExistentClient, null);

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Update Client Information',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register a client
    const registration = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Original Client Name',
    });

    // Update client information
    await clientRegistry.updateClient(registration.client_id, {
      client_name: 'Updated Client Name',
      client_uri: 'https://updated.example.com',
    });

    // Verify updates
    const updatedClient = await clientRegistry.getClient(registration.client_id);
    assertExists(updatedClient);
    assertEquals(updatedClient.client_name, 'Updated Client Name');
    assertEquals(updatedClient.client_uri, 'https://updated.example.com');
    // Original redirect_uris should remain unchanged
    assertEquals(updatedClient.redirect_uris, ['http://localhost:3000/callback']);

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Revoke Client (SECURITY CRITICAL)',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register a client
    const registration = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback'],
      client_name: 'Client to Revoke',
    });

    // Verify client exists
    const validationBefore = await clientRegistry.validateClient(
      registration.client_id,
      'http://localhost:3000/callback'
    );
    assertEquals(validationBefore.valid, true);

    // Revoke client
    await clientRegistry.revokeClient(registration.client_id);

    // Verify client is revoked
    const validationAfter = await clientRegistry.validateClient(
      registration.client_id,
      'http://localhost:3000/callback'
    );
    assertEquals(validationAfter.valid, false);
    assertEquals(validationAfter.error, 'Client not found');

    // Verify client data is removed
    const client = await clientRegistry.getClient(registration.client_id);
    assertEquals(client, null);

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Client Statistics',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    // Use unique test config to avoid interference from other tests
    const uniqueTestConfig = {
      ...testClientConfig,
      // No additional config needed, the ClientRegistry will use its own unique key prefix
    };
    
    const clientRegistry = new ClientRegistry(uniqueTestConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register multiple clients
    const client1 = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback1'],
      client_name: 'Client 1',
    });

    const client2 = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback2'],
      client_name: 'Client 2',
    });

    const client3 = await clientRegistry.registerClient({
      redirect_uris: ['http://localhost:3000/callback3'],
      client_name: 'Client 3',
    });

    // Get statistics
    const stats = await clientRegistry.getClientStats();

    assertEquals(stats.totalClients, 3);
    assertEquals(stats.activeClients, 3);
    assertEquals(stats.revokedClients, 0);

    // Revoke one client
    await clientRegistry.revokeClient(client2.client_id);

    // Check updated statistics
    const updatedStats = await clientRegistry.getClientStats();
    assertEquals(updatedStats.totalClients, 2); // Only 2 clients remain after revocation (deleted)
    assertEquals(updatedStats.activeClients, 2);
    assertEquals(updatedStats.revokedClients, 0); // 0 because revoked clients are deleted

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Cryptographic Security Validation',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register multiple clients to test ID uniqueness
    const clientIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const registration = await clientRegistry.registerClient({
        redirect_uris: [`http://localhost:3000/callback${i}`],
        client_name: `Test Client ${i}`,
      });
      clientIds.push(registration.client_id);
    }

    // Validate all client IDs are unique (cryptographic randomness)
    const uniqueIds = new Set(clientIds);
    assertEquals(uniqueIds.size, clientIds.length, 'All client IDs must be unique');

    // Validate client ID format consistency
    for (const clientId of clientIds) {
      assert(clientId.startsWith('mcp_'), 'Client ID must have correct prefix');
      assertEquals(clientId.length, 'mcp_'.length + 16, 'Client ID must have correct length');
      assert(/^mcp_[a-f0-9]{16}$/.test(clientId), 'Client ID must have correct format');
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Multiple Redirect URIs Support',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Register client with multiple redirect URIs
    const registration = await clientRegistry.registerClient({
      redirect_uris: [
        'http://localhost:3000/callback',
        'http://localhost:3000/auth/callback',
        'http://test.example.com/oauth/callback',
      ],
      client_name: 'Multi-Redirect Client',
    });

    assertEquals(registration.redirect_uris.length, 3);

    // Test validation with each redirect URI
    const uris = [
      'http://localhost:3000/callback',
      'http://localhost:3000/auth/callback', 
      'http://test.example.com/oauth/callback',
    ];

    for (const uri of uris) {
      const validation = await clientRegistry.validateClient(
        registration.client_id,
        uri
      );
      assertEquals(validation.valid, true, `Should validate URI: ${uri}`);
    }

    // Test with invalid URI
    const invalidValidation = await clientRegistry.validateClient(
      registration.client_id,
      'http://malicious.com/callback'
    );
    assertEquals(invalidValidation.valid, false);

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Dynamic Registration Disabled',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    // Create registry with dynamic registration disabled
    const noRegClientRegistry = new ClientRegistry(
      {
        enableDynamicRegistration: false,
        requireHTTPS: false,
        allowedRedirectHosts: ['localhost'],
      },
      { kvManager, logger: mockLogger }
    );

    // Attempt to register client should fail
    try {
      await noRegClientRegistry.registerClient({
        redirect_uris: ['http://localhost:3000/callback'],
        client_name: 'Should Fail Client',
      });
      assert(false, 'Should have thrown error when dynamic registration disabled');
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('Dynamic client registration is disabled'), 
             'Error should mention dynamic registration disabled');
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - HTTPS Requirement Security',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    // Create registry with HTTPS requirement
    const httpsClientRegistry = new ClientRegistry(
      {
        enableDynamicRegistration: true,
        requireHTTPS: true,
        allowedRedirectHosts: ['secure.example.com'],
      },
      { kvManager, logger: mockLogger }
    );

    // HTTPS redirect URI should work
    const httpsRegistration = await httpsClientRegistry.registerClient({
      redirect_uris: ['https://secure.example.com/callback'],
      client_name: 'HTTPS Client',
    });
    assertExists(httpsRegistration.client_id);

    // HTTP redirect URI should fail when HTTPS required
    try {
      await httpsClientRegistry.registerClient({
        redirect_uris: ['http://secure.example.com/callback'],
        client_name: 'HTTP Client',
      });
      assert(false, 'Should have thrown error for HTTP URI when HTTPS required');
    } catch (error) {
      assert(error instanceof Error);
      assert(
        error.message.includes('HTTPS') || error.message.includes('https'), 
        `Error should mention HTTPS requirement. Got: ${error.message}`
      );
    }

    await kvManager.close();
  },
});

Deno.test({
  name: 'ClientRegistry - Error Handling and Edge Cases',
  async fn() {
    const { kvManager } = await createTestDependencies();
    
    const clientRegistry = new ClientRegistry(testClientConfig, {
      kvManager,
      logger: mockLogger,
    });

    // Test empty redirect URIs
    try {
      await clientRegistry.registerClient({
        redirect_uris: [],
        client_name: 'Empty URIs Client',
      });
      assert(false, 'Should have thrown error for empty redirect URIs');
    } catch (error) {
      assert(error instanceof Error);
    }

    // Test invalid redirect URI format
    try {
      await clientRegistry.registerClient({
        redirect_uris: ['not-a-valid-uri'],
        client_name: 'Invalid URI Client',
      });
      assert(false, 'Should have thrown error for invalid URI format');
    } catch (error) {
      assert(error instanceof Error);
    }

    // Test update non-existent client returns false
    const updateResult = await clientRegistry.updateClient('nonexistent_client', {
      client_name: 'Should Fail',
    });
    assertEquals(updateResult, false, 'Should return false for updating non-existent client');

    // Test revoke non-existent client returns false
    const revokeResult = await clientRegistry.revokeClient('nonexistent_client');
    assertEquals(revokeResult, false, 'Should return false for revoking non-existent client');

    await kvManager.close();
  },
});