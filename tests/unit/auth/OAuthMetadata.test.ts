/**
 * OAuthMetadata Unit Tests
 *
 * 🔒 RFC 8414 COMPLIANCE: OAuth Authorization Server Metadata Tests
 *
 * Test Coverage Requirements:
 * - 100% coverage for OAuth metadata generation
 * - RFC 8414 Authorization Server Metadata compliance
 * - MCP-specific extensions validation
 * - Capability advertisement accuracy
 * - Configuration-based metadata generation
 * - Error handling and edge cases
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { OAuthMetadata, type OAuthMetadataConfig } from '../../../src/lib/auth/OAuthMetadata.ts';
import type { Logger } from '../../../src/types/library.types.ts';
import type {
  //AuthorizationServerMetadata,
  OAuthProviderConfig,
} from '../../../src/lib/auth/OAuthTypes.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Complete test configuration for metadata generation
const fullOAuthConfig: OAuthProviderConfig = {
  issuer: 'https://oauth-server.example.com',
  clientId: 'metadata_test_client',
  clientSecret: 'metadata_test_secret',
  tokens: {
    accessTokenExpiryMs: 3600 * 1000,
    refreshTokenExpiryMs: 30 * 24 * 3600 * 1000,
    authorizationCodeExpiryMs: 10 * 60 * 1000,
  },
  clients: {
    enableDynamicRegistration: true,
    requireHTTPS: true,
    allowedRedirectHosts: ['secure.example.com'],
  },
  authorization: {
    supportedGrantTypes: ['authorization_code', 'refresh_token'],
    supportedResponseTypes: ['code'],
    supportedScopes: ['read', 'write', 'admin'],
    enablePKCE: true,
    requirePKCE: true,
  },
};

// Minimal configuration for testing defaults
const minimalOAuthConfig: OAuthProviderConfig = {
  issuer: 'https://minimal.example.com',
  clientId: 'minimal_client',
  clientSecret: 'minimal_secret',
  tokens: {
    accessTokenExpiryMs: 1800 * 1000,
    refreshTokenExpiryMs: 7 * 24 * 3600 * 1000,
    authorizationCodeExpiryMs: 5 * 60 * 1000,
  },
  clients: {
    enableDynamicRegistration: false,
    requireHTTPS: false,
    allowedRedirectHosts: ['localhost'],
  },
  authorization: {
    supportedGrantTypes: ['authorization_code'],
    supportedResponseTypes: ['code'],
    supportedScopes: ['read'],
    enablePKCE: false,
    requirePKCE: false,
  },
};

const endpointConfig = {
  authorizationEndpoint: '/authorize',
  tokenEndpoint: '/token',
  registrationEndpoint: '/register',
  revocationEndpoint: '/revoke',
  metadataEndpoint: '/.well-known/oauth-authorization-server',
};

Deno.test({
  name: 'OAuthMetadata - Initialize with Full Configuration',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    // Verify metadata handler is initialized
    assertExists(oauthMetadata);
  },
});

Deno.test({
  name: 'OAuthMetadata - Generate Complete Authorization Server Metadata (RFC 8414)',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      ...endpointConfig,

      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);
    console.log('oauthMetadata', oauthMetadata);

    const metadata = oauthMetadata.generateMetadata();
    console.log('metadata', metadata);

    // RFC 8414 Required Fields
    assertEquals(metadata.issuer, 'https://oauth-server.example.com');
    assertEquals(metadata.authorization_endpoint, 'https://oauth-server.example.com/authorize');
    assertEquals(metadata.token_endpoint, 'https://oauth-server.example.com/token');

    // RFC 8414 Optional Fields (commonly implemented)
    assertEquals(metadata.registration_endpoint, 'https://oauth-server.example.com/register');
    assertEquals(metadata.revocation_endpoint, 'https://oauth-server.example.com/revoke');

    // Grant Types Supported
    assertEquals(metadata.grant_types_supported, ['authorization_code', 'refresh_token']);

    // Response Types Supported
    assertEquals(metadata.response_types_supported, ['code']);

    // Scopes Supported
    assertEquals(metadata.scopes_supported, ['read', 'write', 'admin']);

    // Token Endpoint Auth Methods
    assert(Array.isArray(metadata.token_endpoint_auth_methods_supported));
    assert(metadata.token_endpoint_auth_methods_supported.includes('client_secret_basic'));
    assert(metadata.token_endpoint_auth_methods_supported.includes('client_secret_post'));

    // PKCE Support
    assertEquals(metadata.code_challenge_methods_supported, ['S256']);

    // MCP-Specific Extensions
    assertExists(metadata.mcp_extensions);
    assertEquals(metadata.mcp_extensions.server_name, 'bb-mcp-server');
    assertExists(metadata.mcp_extensions.server_version);
    assert(Array.isArray(metadata.mcp_extensions.supported_workflows));
  },
});

Deno.test({
  name: 'OAuthMetadata - Generate Minimal Metadata Configuration',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: minimalOAuthConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: minimalOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: minimalOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: minimalOAuthConfig.authorization.supportedScopes,
      enablePKCE: minimalOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: minimalOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    // Basic required fields
    assertEquals(metadata.issuer, 'https://minimal.example.com');
    assertEquals(metadata.authorization_endpoint, 'https://minimal.example.com/authorize');
    assertEquals(metadata.token_endpoint, 'https://minimal.example.com/token');

    // Minimal grant and response types
    assertEquals(metadata.grant_types_supported, ['authorization_code']);
    assertEquals(metadata.response_types_supported, ['code']);
    assertEquals(metadata.scopes_supported, ['read']);

    // No PKCE support in minimal config
    assertEquals(metadata.code_challenge_methods_supported, []);

    // Should still have MCP extensions
    assertExists(metadata.mcp_extensions);
    assertEquals(metadata.mcp_extensions.server_name, 'bb-mcp-server');
  },
});

Deno.test({
  name: 'OAuthMetadata - Get Supported Grant Types',
  async fn() {
    const fullMetadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const minimalMetadataConfig: OAuthMetadataConfig = {
      issuer: minimalOAuthConfig.issuer,
      supportedGrantTypes: minimalOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: minimalOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: minimalOAuthConfig.authorization.supportedScopes,
      enablePKCE: minimalOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: minimalOAuthConfig.clients.enableDynamicRegistration,
    };
    const fullMetadata = new OAuthMetadata(fullMetadataConfig, mockLogger);
    const minimalMetadata = new OAuthMetadata(minimalMetadataConfig, mockLogger);

    // Full configuration grant types
    const fullGrantTypes = fullMetadata.getSupportedGrantTypes();
    assertEquals(fullGrantTypes, ['authorization_code', 'refresh_token']);

    // Minimal configuration grant types
    const minimalGrantTypes = minimalMetadata.getSupportedGrantTypes();
    assertEquals(minimalGrantTypes, ['authorization_code']);
  },
});

Deno.test({
  name: 'OAuthMetadata - Get Supported Response Types',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const responseTypes = oauthMetadata.getSupportedResponseTypes();
    assertEquals(responseTypes, ['code']);
  },
});

Deno.test({
  name: 'OAuthMetadata - Get Supported Scopes',
  async fn() {
    const fullMetadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const minimalMetadataConfig: OAuthMetadataConfig = {
      issuer: minimalOAuthConfig.issuer,
      supportedGrantTypes: minimalOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: minimalOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: minimalOAuthConfig.authorization.supportedScopes,
      enablePKCE: minimalOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: minimalOAuthConfig.clients.enableDynamicRegistration,
    };
    const fullMetadata = new OAuthMetadata(fullMetadataConfig, mockLogger);
    const minimalMetadata = new OAuthMetadata(minimalMetadataConfig, mockLogger);

    // Full configuration scopes
    const fullScopes = fullMetadata.getSupportedScopes();
    assertEquals(fullScopes, ['read', 'write', 'admin']);

    // Minimal configuration scopes
    const minimalScopes = minimalMetadata.getSupportedScopes();
    assertEquals(minimalScopes, ['read']);
  },
});

Deno.test({
  name: 'OAuthMetadata - Get Code Challenge Methods Supported',
  async fn() {
    const fullMetadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const minimalMetadataConfig: OAuthMetadataConfig = {
      issuer: minimalOAuthConfig.issuer,
      supportedGrantTypes: minimalOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: minimalOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: minimalOAuthConfig.authorization.supportedScopes,
      enablePKCE: minimalOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: minimalOAuthConfig.clients.enableDynamicRegistration,
    };
    const fullMetadata = new OAuthMetadata(fullMetadataConfig, mockLogger);
    const minimalMetadata = new OAuthMetadata(minimalMetadataConfig, mockLogger);

    // Full configuration with PKCE enabled
    const fullMethods = fullMetadata.getCodeChallengeMethodsSupported();
    assertEquals(fullMethods, ['S256']);

    // Minimal configuration with PKCE disabled
    const minimalMethods = minimalMetadata.getCodeChallengeMethodsSupported();
    assertEquals(minimalMethods, []);
  },
});

Deno.test({
  name: 'OAuthMetadata - Get Token Endpoint Auth Methods Supported',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const authMethods = oauthMetadata.getTokenEndpointAuthMethodsSupported();

    // Should support common client authentication methods
    assert(Array.isArray(authMethods));
    assert(authMethods.includes('client_secret_basic'));
    assert(authMethods.includes('client_secret_post'));
    assert(authMethods.includes('none')); // For public clients
  },
});

Deno.test({
  name: 'OAuthMetadata - Dynamic Registration Endpoint Configuration',
  async fn() {
    const enabledRegistrationConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      clients: {
        ...fullOAuthConfig.clients,
        enableDynamicRegistration: true,
      },
    };

    const disabledRegistrationConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      clients: {
        ...fullOAuthConfig.clients,
        enableDynamicRegistration: false,
      },
    };

    // With dynamic registration enabled
    const enabledMetadataConfig: OAuthMetadataConfig = {
      issuer: enabledRegistrationConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: enabledRegistrationConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: enabledRegistrationConfig.authorization.supportedResponseTypes,
      supportedScopes: enabledRegistrationConfig.authorization.supportedScopes,
      enablePKCE: enabledRegistrationConfig.authorization.enablePKCE,
      enableDynamicRegistration: enabledRegistrationConfig.clients.enableDynamicRegistration,
    };
    const enabledMetadata = new OAuthMetadata(enabledMetadataConfig, mockLogger);
    const enabledData = enabledMetadata.generateMetadata();
    assertEquals(enabledData.registration_endpoint, 'https://oauth-server.example.com/register');

    // With dynamic registration disabled
    const disabledMetadataConfig: OAuthMetadataConfig = {
      issuer: disabledRegistrationConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: disabledRegistrationConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: disabledRegistrationConfig.authorization.supportedResponseTypes,
      supportedScopes: disabledRegistrationConfig.authorization.supportedScopes,
      enablePKCE: disabledRegistrationConfig.authorization.enablePKCE,
      enableDynamicRegistration: disabledRegistrationConfig.clients.enableDynamicRegistration,
    };
    const disabledMetadata = new OAuthMetadata(disabledMetadataConfig, mockLogger);
    const disabledData = disabledMetadata.generateMetadata();
    assertEquals(disabledData.registration_endpoint, undefined);
  },
});

Deno.test({
  name: 'OAuthMetadata - MCP Extensions Content',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    assertExists(metadata.mcp_extensions);

    // Server identification
    assertEquals(metadata.mcp_extensions.server_name, 'bb-mcp-server');
    assertExists(metadata.mcp_extensions.server_version);

    // Supported workflows
    assert(Array.isArray(metadata.mcp_extensions.supported_workflows));
    // Should include common MCP workflows
    assert(metadata.mcp_extensions.supported_workflows.includes('oauth_authorization'));
    assert(metadata.mcp_extensions.supported_workflows.includes('session_management'));
    assert(metadata.mcp_extensions.supported_workflows.includes('token_validation'));
  },
});

Deno.test({
  name: 'OAuthMetadata - RFC 8414 Compliance Validation',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    // RFC 8414 Section 2: Authorization Server Metadata
    // REQUIRED metadata values
    assertExists(metadata.issuer);
    assert(typeof metadata.issuer === 'string');
    assert(metadata.issuer.startsWith('https://'));

    // OPTIONAL metadata values that are commonly implemented
    assertExists(metadata.authorization_endpoint);
    assertExists(metadata.token_endpoint);
    assert(Array.isArray(metadata.grant_types_supported));
    assert(Array.isArray(metadata.response_types_supported));

    // Validate endpoint URL structure
    assert(metadata.authorization_endpoint.startsWith(metadata.issuer));
    assert(metadata.token_endpoint.startsWith(metadata.issuer));

    if (metadata.registration_endpoint) {
      assert(metadata.registration_endpoint.startsWith(metadata.issuer));
    }

    if (metadata.revocation_endpoint) {
      assert(metadata.revocation_endpoint.startsWith(metadata.issuer));
    }
  },
});

Deno.test({
  name: 'OAuthMetadata - Endpoint URL Generation',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    // Validate all endpoint URLs are properly constructed
    const baseUrl = 'https://oauth-server.example.com';
    assertEquals(metadata.authorization_endpoint, `${baseUrl}/authorize`);
    assertEquals(metadata.token_endpoint, `${baseUrl}/token`);
    assertEquals(metadata.registration_endpoint, `${baseUrl}/register`);
    assertEquals(metadata.revocation_endpoint, `${baseUrl}/revoke`);
  },
});

Deno.test({
  name: 'OAuthMetadata - Custom Issuer URL Handling',
  async fn() {
    const customIssuerConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      issuer: 'https://custom-oauth.company.com:8443/auth',
    };

    const metadataConfig: OAuthMetadataConfig = {
      issuer: customIssuerConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: customIssuerConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: customIssuerConfig.authorization.supportedResponseTypes,
      supportedScopes: customIssuerConfig.authorization.supportedScopes,
      enablePKCE: customIssuerConfig.authorization.enablePKCE,
      enableDynamicRegistration: customIssuerConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    assertEquals(metadata.issuer, 'https://custom-oauth.company.com:8443/auth');
    assertEquals(
      metadata.authorization_endpoint,
      'https://custom-oauth.company.com:8443/auth/authorize',
    );
    assertEquals(metadata.token_endpoint, 'https://custom-oauth.company.com:8443/auth/token');
    assertEquals(
      metadata.registration_endpoint,
      'https://custom-oauth.company.com:8443/auth/register',
    );
  },
});

Deno.test({
  name: 'OAuthMetadata - PKCE Methods Configuration',
  async fn() {
    // Configuration with PKCE enabled
    const pkceEnabledConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        enablePKCE: true,
        requirePKCE: true,
      },
    };

    // Configuration with PKCE disabled
    const pkceDisabledConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        enablePKCE: false,
        requirePKCE: false,
      },
    };

    const enabledMetadataConfig: OAuthMetadataConfig = {
      issuer: pkceEnabledConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: pkceEnabledConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: pkceEnabledConfig.authorization.supportedResponseTypes,
      supportedScopes: pkceEnabledConfig.authorization.supportedScopes,
      enablePKCE: pkceEnabledConfig.authorization.enablePKCE,
      enableDynamicRegistration: pkceEnabledConfig.clients.enableDynamicRegistration,
    };
    const disabledMetadataConfig: OAuthMetadataConfig = {
      issuer: pkceDisabledConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: pkceDisabledConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: pkceDisabledConfig.authorization.supportedResponseTypes,
      supportedScopes: pkceDisabledConfig.authorization.supportedScopes,
      enablePKCE: pkceDisabledConfig.authorization.enablePKCE,
      enableDynamicRegistration: pkceDisabledConfig.clients.enableDynamicRegistration,
    };
    const enabledMetadata = new OAuthMetadata(enabledMetadataConfig, mockLogger);
    const disabledMetadata = new OAuthMetadata(disabledMetadataConfig, mockLogger);

    // PKCE enabled should advertise S256 method
    const enabledData = enabledMetadata.generateMetadata();
    assertEquals(enabledData.code_challenge_methods_supported, ['S256']);

    // PKCE disabled should not advertise any methods
    const disabledData = disabledMetadata.generateMetadata();
    assertEquals(disabledData.code_challenge_methods_supported, []);
  },
});

Deno.test({
  name: 'OAuthMetadata - Scope Advertisement Accuracy',
  async fn() {
    const customScopesConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        supportedScopes: ['profile', 'email', 'openid', 'admin:read', 'admin:write'],
      },
    };

    const metadataConfig: OAuthMetadataConfig = {
      issuer: customScopesConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: customScopesConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: customScopesConfig.authorization.supportedResponseTypes,
      supportedScopes: customScopesConfig.authorization.supportedScopes,
      enablePKCE: customScopesConfig.authorization.enablePKCE,
      enableDynamicRegistration: customScopesConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    assertEquals(metadata.scopes_supported, [
      'profile',
      'email',
      'openid',
      'admin:read',
      'admin:write',
    ]);
  },
});

Deno.test({
  name: 'OAuthMetadata - Grant Type Advertisement',
  async fn() {
    const customGrantsConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        supportedGrantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      },
    };

    const metadataConfig: OAuthMetadataConfig = {
      issuer: customGrantsConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: customGrantsConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: customGrantsConfig.authorization.supportedResponseTypes,
      supportedScopes: customGrantsConfig.authorization.supportedScopes,
      enablePKCE: customGrantsConfig.authorization.enablePKCE,
      enableDynamicRegistration: customGrantsConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    assertEquals(metadata.grant_types_supported, [
      'authorization_code',
      'refresh_token',
      'client_credentials',
    ]);
  },
});

Deno.test({
  name: 'OAuthMetadata - Response Type Advertisement',
  async fn() {
    const customResponseTypesConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        supportedResponseTypes: ['code', 'token', 'code token'],
      },
    };

    const metadataConfig: OAuthMetadataConfig = {
      issuer: customResponseTypesConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: customResponseTypesConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: customResponseTypesConfig.authorization.supportedResponseTypes,
      supportedScopes: customResponseTypesConfig.authorization.supportedScopes,
      enablePKCE: customResponseTypesConfig.authorization.enablePKCE,
      enableDynamicRegistration: customResponseTypesConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata = oauthMetadata.generateMetadata();

    assertEquals(metadata.response_types_supported, ['code', 'token', 'code token']);
  },
});

Deno.test({
  name: 'OAuthMetadata - Metadata Consistency Validation',
  async fn() {
    const metadataConfig: OAuthMetadataConfig = {
      issuer: fullOAuthConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: fullOAuthConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: fullOAuthConfig.authorization.supportedResponseTypes,
      supportedScopes: fullOAuthConfig.authorization.supportedScopes,
      enablePKCE: fullOAuthConfig.authorization.enablePKCE,
      enableDynamicRegistration: fullOAuthConfig.clients.enableDynamicRegistration,
    };
    const oauthMetadata = new OAuthMetadata(metadataConfig, mockLogger);

    const metadata1 = oauthMetadata.generateMetadata();
    const metadata2 = oauthMetadata.generateMetadata();

    // Metadata should be consistent between calls
    assertEquals(metadata1.issuer, metadata2.issuer);
    assertEquals(metadata1.authorization_endpoint, metadata2.authorization_endpoint);
    assertEquals(metadata1.token_endpoint, metadata2.token_endpoint);
    assertEquals(metadata1.grant_types_supported, metadata2.grant_types_supported);
    assertEquals(metadata1.response_types_supported, metadata2.response_types_supported);
    assertEquals(metadata1.scopes_supported, metadata2.scopes_supported);
    assertEquals(
      metadata1.code_challenge_methods_supported,
      metadata2.code_challenge_methods_supported,
    );
  },
});

Deno.test({
  name: 'OAuthMetadata - Edge Cases and Error Handling',
  async fn() {
    // Test with empty scopes
    const emptyScopesConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        supportedScopes: [],
      },
    };

    const emptyScopesMetadataConfig: OAuthMetadataConfig = {
      issuer: emptyScopesConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: emptyScopesConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: emptyScopesConfig.authorization.supportedResponseTypes,
      supportedScopes: emptyScopesConfig.authorization.supportedScopes,
      enablePKCE: emptyScopesConfig.authorization.enablePKCE,
      enableDynamicRegistration: emptyScopesConfig.clients.enableDynamicRegistration,
    };
    const emptyScopesMetadata = new OAuthMetadata(emptyScopesMetadataConfig, mockLogger);
    const emptyScopesData = emptyScopesMetadata.generateMetadata();
    assertEquals(emptyScopesData.scopes_supported, []);

    // Test with empty grant types (should still work)
    const emptyGrantsConfig: OAuthProviderConfig = {
      ...fullOAuthConfig,
      authorization: {
        ...fullOAuthConfig.authorization,
        supportedGrantTypes: [],
      },
    };

    const emptyGrantsMetadataConfig: OAuthMetadataConfig = {
      issuer: emptyGrantsConfig.issuer,
      ...endpointConfig,
      supportedGrantTypes: emptyGrantsConfig.authorization.supportedGrantTypes,
      supportedResponseTypes: emptyGrantsConfig.authorization.supportedResponseTypes,
      supportedScopes: emptyGrantsConfig.authorization.supportedScopes,
      enablePKCE: emptyGrantsConfig.authorization.enablePKCE,
      enableDynamicRegistration: emptyGrantsConfig.clients.enableDynamicRegistration,
    };
    const emptyGrantsMetadata = new OAuthMetadata(emptyGrantsMetadataConfig, mockLogger);
    const emptyGrantsData = emptyGrantsMetadata.generateMetadata();
    assertEquals(emptyGrantsData.grant_types_supported, []);
  },
});
