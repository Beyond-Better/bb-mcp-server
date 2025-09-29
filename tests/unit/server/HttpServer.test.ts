/**
 * HttpServer Test - Phase 5 HTTP Server Integration Tests
 *
 * Tests the core HTTP server functionality including OAuth endpoint integration,
 * API routing, CORS handling, and error management. Validates that all Phase 4
 * OAuth components are properly integrated with the HTTP transport layer.
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { HttpServer } from '../../../src/lib/server/HttpServer.ts';
import { OAuthProvider } from '../../../src/lib/auth/OAuthProvider.ts';
import { TransportManager } from '../../../src/lib/transport/TransportManager.ts';
import { WorkflowRegistry } from '../../../src/lib/workflows/WorkflowRegistry.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';
import type {
  HttpServerConfig,
  HttpServerDependencies,
} from '../../../src/lib/server/HttpServer.ts';

// Mock dependencies for testing
class MockLogger {
  debug(message: string, data?: unknown): void {
    // Silent for tests
  }

  info(message: string, data?: unknown): void {
    // Silent for tests
  }

  warn(message: string, data?: unknown): void {
    console.warn(`WARN: ${message}`, data);
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    console.error(`ERROR: ${message}`, error, data);
  }
}

class MockOAuthProvider {
  async handleAuthorizeRequest(request: any, userId: string): Promise<any> {
    return {
      code: 'mock-auth-code',
      state: request.state,
      redirectUrl: `${request.redirect_uri}?code=mock-auth-code&state=${request.state}`,
    };
  }

  async handleTokenRequest(request: any): Promise<any> {
    return {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'read',
    };
  }

  async handleClientRegistration(request: any, metadata: any): Promise<any> {
    return {
      client_id: 'mock-client-id',
      client_id_issued_at: Date.now(),
      redirect_uris: request.redirect_uris,
    };
  }

  async getMCPAuthRequest(state: string): Promise<any> {
    // Mock MCP auth request for callback handling
    if (state === 'test-state') {
      return {
        client_id: 'test-client',
        user_id: 'test-user',
        redirect_uri: 'http://localhost:3503/callback',
        state: 'test-state',
        code_challenge: undefined,
      };
    }
    return null;
  }

  async generateMCPAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge?: string,
  ): Promise<string> {
    return 'mock-mcp-auth-code';
  }

  async getAuthorizationServerMetadata(): Promise<any> {
    return {
      issuer: 'http://localhost:3503',
      authorization_endpoint: 'http://localhost:3503/authorize',
      token_endpoint: 'http://localhost:3503/token',
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      scopes_supported: ['read', 'write'],
      code_challenge_methods_supported: ['S256'],
    };
  }
}

class MockTransportManager {
  async handleHttpRequest(request: Request): Promise<Response> {
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: 'mock-mcp-response' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  getMetrics() {
    return {
      activeSessions: 0,
      sessionIds: [],
      transportType: 'mixed',
    };
  }
}

class MockWorkflowRegistry {
  getWorkflowNames(): string[] {
    return ['test-workflow'];
  }

  getAllRegistrations(): any[] {
    return [{
      name: 'test-workflow',
      displayName: 'Test Workflow',
      description: 'A test workflow',
      version: '1.0.0',
      category: 'test',
      requiresAuth: false,
      estimatedDuration: 1000,
      tags: ['test'],
    }];
  }

  getRegistration(name: string): any {
    return name === 'test-workflow' ? this.getAllRegistrations()[0] : null;
  }
}

// Helper function to create test dependencies
function createTestDependencies(): HttpServerDependencies {
  const httpServerConfig: HttpServerConfig = {
    hostname: 'localhost',
    port: 3500,
    name: 'Test MCP Server',
    version: '1.0.0',
    environment: 'test',
    cors: {
      allowOrigin: '*',
    },
    api: {
      version: 'v1',
      basePath: '/api/v1',
    },
  };

  return {
    logger: new MockLogger(),
    transportManager: new MockTransportManager() as any,
    oauthProvider: new MockOAuthProvider() as any,
    workflowRegistry: new MockWorkflowRegistry() as any,
    httpServerConfig,
  };
}

// Helper function to make HTTP requests to test server
async function makeRequest(
  port: number,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `http://localhost:${port}${path}`;
  return await fetch(url, {
    ...options,
    redirect: 'manual', // Don't follow redirects automatically
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

Deno.test('HttpServer - Initialization', async () => {
  const dependencies = createTestDependencies();
  const server = new HttpServer(dependencies);

  assertExists(server);
  assertEquals(typeof server.start, 'function');
  assertEquals(typeof server.stop, 'function');
});

Deno.test('HttpServer - Root Endpoint', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3501; // Use different port for each test
  const server = new HttpServer(dependencies);

  try {
    await server.start();

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await makeRequest(3501, '/');
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.name, 'Test MCP Server');
    assertEquals(data.version, '1.0.0');
    assertExists(data.api);
    assertExists(data.oauth2);
    assertExists(data.mcp);
  } finally {
    await server.stop();
    // Give server time to fully stop to prevent async leaks
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});

Deno.test('HttpServer - CORS Headers', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3502;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test preflight request
    const preflightResponse = await makeRequest(3502, '/', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });

    assertEquals(preflightResponse.status, 204);
    assert(preflightResponse.headers.get('access-control-allow-origin'));
    assert(preflightResponse.headers.get('access-control-allow-methods'));
    // Consume response body to prevent leaks
    await preflightResponse.text();

    // Test actual request has CORS headers
    const actualResponse = await makeRequest(3502, '/');
    assertEquals(actualResponse.status, 200);
    assert(actualResponse.headers.get('access-control-allow-origin'));
    // Consume response body
    await actualResponse.json();
  } finally {
    await server.stop();
    // Give server time to fully stop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});

Deno.test('HttpServer - OAuth Endpoints Integration', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3503;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test OAuth authorization endpoint
    const authUrl = '/authorize?' + new URLSearchParams({
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'http://localhost:3503/callback',
      state: 'test-state',
    });

    const authResponse = await makeRequest(3503, authUrl);
    assertEquals(authResponse.status, 302);

    const location = authResponse.headers.get('location');
    assert(location);
    assert(location.includes('code=mock-auth-code'));
    assert(location.includes('state=test-state'));
    // Consume response body to prevent leaks
    await authResponse.text();

    // Test OAuth token endpoint
    const tokenResponse = await makeRequest(3503, '/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'test-client',
        code: 'mock-auth-code',
        redirect_uri: 'http://localhost:3503/callback',
        code_verifier: 'test-verifier',
      }),
    });

    assertEquals(tokenResponse.status, 200);
    const tokenData = await tokenResponse.json();
    assertEquals(tokenData.access_token, 'mock-access-token');
    assertEquals(tokenData.token_type, 'Bearer');
  } finally {
    await server.stop();
    // Give server time to fully stop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});

Deno.test('HttpServer - API Endpoints', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3504;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test API root
    const apiResponse = await makeRequest(3504, '/api/v1/');
    assertEquals(apiResponse.status, 200);

    const apiData = await apiResponse.json();
    assertEquals(apiData.version, 'v1');
    assertExists(apiData.resources);

    // Test status endpoint
    const statusResponse = await makeRequest(3504, '/api/v1/status');
    assertEquals(statusResponse.status, 200);

    const statusData = await statusResponse.json();
    assertExists(statusData.server);
    assertExists(statusData.workflows);

    // Test health check
    const healthResponse = await makeRequest(3504, '/api/v1/status/health');
    assertEquals(healthResponse.status, 200);

    const healthData = await healthResponse.json();
    assertEquals(healthData.status, 'healthy');
    assertExists(healthData.checks);
  } finally {
    await server.stop();
    // Give server time to fully stop to prevent async leaks
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

Deno.test('HttpServer - MCP Endpoint Integration', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3505;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test MCP endpoint
    const mcpRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: {},
    };

    const mcpResponse = await makeRequest(3505, '/mcp', {
      method: 'POST',
      body: JSON.stringify(mcpRequest),
    });

    assertEquals(mcpResponse.status, 200);

    const mcpData = await mcpResponse.json();
    assertEquals(mcpData.jsonrpc, '2.0');
    assertExists(mcpData.result);
  } finally {
    await server.stop();
    // Give server time to fully stop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});

Deno.test('HttpServer - Well-Known OAuth Metadata', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3506;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const metadataResponse = await makeRequest(3506, '/.well-known/oauth-authorization-server');
    assertEquals(metadataResponse.status, 200);

    const metadata = await metadataResponse.json();
    assertEquals(metadata.issuer, 'http://localhost:3503');
    assert(metadata.authorization_endpoint);
    assert(metadata.token_endpoint);
    assert(metadata.grant_types_supported.includes('authorization_code'));
    assert(metadata.code_challenge_methods_supported.includes('S256'));
  } finally {
    await server.stop();
  }
});

Deno.test('HttpServer - Error Handling', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3507;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Test 404 error
    const notFoundResponse = await makeRequest(3507, '/nonexistent');
    assertEquals(notFoundResponse.status, 404);

    const errorData = await notFoundResponse.json();
    assertEquals(errorData.error.status, 404);
    assertExists(errorData.error.message);

    // Test method not allowed
    const methodResponse = await makeRequest(3507, '/authorize', {
      method: 'POST', // GET only endpoint
    });
    assertEquals(methodResponse.status, 404); // Routed as unknown endpoint
    // Consume response body to prevent leaks
    await methodResponse.json();
  } finally {
    await server.stop();
    // Give server time to fully stop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});

Deno.test('HttpServer - Legacy Health Endpoint', async () => {
  const dependencies = createTestDependencies();
  dependencies.httpServerConfig.port = 3508;
  const server = new HttpServer(dependencies);

  try {
    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const healthResponse = await makeRequest(3508, '/health');
    assertEquals(healthResponse.status, 200);

    const healthData = await healthResponse.json();
    assertEquals(healthData.status, 'healthy');
    assertEquals(healthData.server, 'http-server');
  } finally {
    await server.stop();
  }
});
