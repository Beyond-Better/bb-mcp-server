/**
 * OAuth Type Definitions - Comprehensive OAuth 2.0 Type System
 * 
 * Consolidates all OAuth-related types and interfaces for the bb-mcp-server library.
 * These types maintain exact compatibility with the original OAuthClientService.ts and
 * AuthenticationService.ts implementations while providing a clean type system.
 * 
 * Extracted from: 
 * - actionstep-mcp-server/src/api/OAuthClientService.ts
 * - actionstep-mcp-server/src/api/AuthenticationService.ts
 * 
 * Standards Compliance:
 * - RFC 6749: OAuth 2.0 Authorization Framework
 * - RFC 7636: PKCE (Proof Key for Code Exchange)
 * - RFC 7591: Dynamic Client Registration Protocol  
 * - RFC 8414: OAuth 2.0 Authorization Server Metadata
 */

export * from './TokenManager.ts';
export * from './PKCEHandler.ts';

// ============================================================================
// OAuth Provider Configuration Types
// ============================================================================

/**
 * Configuration for OAuth Provider (Authorization Server)
 */
export interface OAuthProviderConfig {
  /** OAuth issuer identifier (base URL) */
  issuer: string;
  /** Provider client ID */
  clientId: string;
  /** Provider client secret */
  clientSecret: string;
  /** Default redirect URI (optional for server-to-server flows) */
  redirectUri?: string;
  
  /** Token configuration */
  tokens: {
    /** Access token expiry in milliseconds (default: 3600000 = 1 hour) */
    accessTokenExpiryMs: number;
    /** Refresh token expiry in milliseconds (default: 2592000000 = 30 days) */
    refreshTokenExpiryMs: number;
    /** Authorization code expiry in milliseconds (default: 600000 = 10 minutes) */
    authorizationCodeExpiryMs: number;
  };
  
  /** Client management configuration */
  clients: {
    /** Enable dynamic client registration (RFC 7591) */
    enableDynamicRegistration: boolean;
    /** Require HTTPS redirect URIs in production */
    requireHTTPS: boolean;
    /** Allowed redirect URI hosts for security */
    allowedRedirectHosts: string[];
  };
  
  /** Authorization configuration */
  authorization: {
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
  };
}

/**
 * Configuration for OAuth Consumer (Client)
 */
export interface OAuthConsumerConfig {
  /** Provider identifier */
  providerId: string;
  /** Authorization endpoint URL */
  authUrl: string;
  /** Token endpoint URL */
  tokenUrl: string;
  /** Client ID */
  clientId: string;
  /** Client secret */
  clientSecret: string;
  /** Redirect URI */
  redirectUri: string;
  /** Requested scopes */
  scopes: string[];
  /** Token refresh buffer in minutes (default: 5) */
  tokenRefreshBufferMinutes: number;
  /** Maximum token refresh retries */
  maxTokenRefreshRetries: number;
  /** Custom headers for requests */
  customHeaders?: Record<string, string>;
}

// ============================================================================
// OAuth Client Registration Types (RFC 7591)
// ============================================================================

/**
 * OAuth client registration request (RFC 7591)
 */
export interface ClientRegistrationRequest {
  /** Array of redirect URIs */
  redirect_uris: string[];
  /** Optional client name */
  client_name?: string;
  /** Supported response types (defaults to ['code']) */
  response_types?: string[];
  /** Supported grant types (defaults to ['authorization_code', 'refresh_token']) */
  grant_types?: string[];
  /** Additional client metadata */
  [key: string]: unknown;
}

/**
 * OAuth client registration response (RFC 7591)
 */
export interface ClientRegistrationResponse {
  /** Generated client ID */
  client_id: string;
  /** Client secret (if applicable) */
  client_secret?: string;
  /** Client secret expiration (0 = never expires, no secret for PKCE-only) */
  client_secret_expires_at: number;
  /** Token endpoint authentication method */
  token_endpoint_auth_method: 'none' | 'client_secret_basic' | 'client_secret_post';
  /** Registered redirect URIs */
  redirect_uris: string[];
  /** Allowed response types */
  response_types: string[];
  /** Allowed grant types */
  grant_types: string[];
  /** Required PKCE code challenge methods */
  code_challenge_methods_supported: string[];
  /** Client name */
  client_name?: string;
  /** Registration URI for updates */
  registration_client_uri?: string;
  /** Registration access token (for client management) */
  registration_access_token?: string;
  /** Client URI for display */
  client_uri?: string;
  /** Client ID issued timestamp */
  client_id_issued_at?: number;
  /** Allowed scopes for this client */
  scope?: string;
  /** Contact information */
  contacts?: string[];
  /** Terms of service URI */
  tos_uri?: string;
  /** Privacy policy URI */
  policy_uri?: string;
}

/**
 * Stored client registration data
 */
export interface ClientRegistration {
  /** Unique client identifier generated by this server */
  client_id: string;
  /** Optional client secret (not used for PKCE flows) */
  client_secret?: string;
  /** Timestamp when client expires (0 = never) */
  client_secret_expires_at: number;
  /** Client name for display purposes */
  client_name?: string;
  /** Array of valid redirect URIs */
  redirect_uris: string[];
  /** Allowed response types */
  response_types?: string[];
  /** Allowed grant types */
  grant_types?: string[];
  /** Registration timestamp */
  created_at: number;
  /** Last updated timestamp */
  updated_at: number;
  /** Client URI for display (optional) */
  client_uri?: string;
  /** Client ID issued timestamp (optional) */
  client_id_issued_at?: number;
  /** Allowed scopes for this client (optional) */
  scope?: string;
  /** Contact information */
  contacts?: string[];
  /** Terms of service URI */
  tos_uri?: string;
  /** Privacy policy URI */
  policy_uri?: string;
  /** Client metadata */
  metadata?: {
    user_agent?: string;
    ip_address?: string;
    revoked?: boolean;
    revoked_at?: number;
    [key: string]: unknown;
  };
}

// ============================================================================
// OAuth Request/Response Types (RFC 6749)
// ============================================================================

/**
 * OAuth authorization request
 */
export interface AuthorizeRequest {
  /** Response type (always 'code' for authorization code flow) */
  response_type: string;
  /** Client identifier */
  client_id: string;
  /** Redirect URI */
  redirect_uri: string;
  /** Requested scope */
  scope?: string;
  /** State parameter for CSRF protection (required for security) */
  state?: string;
  /** PKCE code challenge */
  code_challenge?: string;
  /** PKCE code challenge method */
  code_challenge_method?: string;
}

/**
 * OAuth authorization response
 */
export interface AuthorizeResponse {
  /** Generated authorization code */
  code: string;
  /** State parameter (returned unchanged) */
  state: string;
  /** Complete redirect URL with parameters */
  redirectUrl: string;
}

/**
 * OAuth token request
 */
export interface TokenRequest {
  /** Grant type */
  grant_type: 'authorization_code' | 'refresh_token';
  /** Client identifier */
  client_id: string;
  /** Client secret (if required) */
  client_secret?: string;
  /** Authorization code (for authorization_code grant) */
  code?: string;
  /** Refresh token (for refresh_token grant) */
  refresh_token?: string;
  /** Redirect URI (must match authorization request) */
  redirect_uri?: string;
  /** PKCE code verifier */
  code_verifier?: string;
}

/**
 * OAuth token response
 */
export interface TokenResponse {
  /** Access token */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: 'Bearer';
  /** Token expiry in seconds */
  expires_in: number;
  /** Refresh token (if issued) */
  refresh_token?: string;
  /** Token scope */
  scope?: string;
}

// ============================================================================
// OAuth Authorization Server Metadata Types (RFC 8414)
// ============================================================================

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
 * OAuth client interface for compatibility
 */
export interface OAuthClient {
  /** Client identifier */
  client_id: string;
  /** Client secret (optional for PKCE flows) */
  client_secret?: string;
  /** Client name */
  client_name?: string;
  /** Redirect URIs */
  redirect_uris: string[];
  /** Response types */
  response_types?: string[];
  /** Grant types */
  grant_types?: string[];
  /** Creation timestamp */
  created_at: number;
  /** Update timestamp */
  updated_at: number;
  /** Client metadata */
  metadata?: Record<string, unknown>;
}

/**
 * OAuth Authorization Server Metadata (RFC 8414)
 */
export interface AuthorizationServerMetadata {
  /** Authorization server issuer identifier */
  issuer: string;
  /** Authorization endpoint URL */
  authorization_endpoint: string;
  /** Token endpoint URL */
  token_endpoint: string;
  /** Client registration endpoint URL (optional) */
  registration_endpoint?: string;
  /** Token revocation endpoint URL (optional) */
  revocation_endpoint?: string;
  /** Supported grant types */
  grant_types_supported: string[];
  /** Supported response types */
  response_types_supported: string[];
  /** Supported scopes */
  scopes_supported: string[];
  /** Supported token endpoint authentication methods */
  token_endpoint_auth_methods_supported: string[];
  /** Supported PKCE code challenge methods */
  code_challenge_methods_supported: string[];
  /** MCP-specific extensions */
  mcp_extensions?: {
    server_name: string;
    server_version: string;
    supported_workflows: string[];
  };
}

// ============================================================================
// MCP OAuth Flow Types (Session Binding)
// ============================================================================

/**
 * MCP Authorization Request for session binding
 */
export interface MCPAuthorizationRequest {
  /** MCP client ID that initiated the request */
  client_id: string;
  /** MCP client's redirect URI */
  redirect_uri: string;
  /** MCP client's original state parameter */
  state: string;
  /** PKCE code challenge (if provided) */
  code_challenge?: string;
  /** PKCE code challenge method */
  code_challenge_method?: string;
  /** ActionStep OAuth state (for linking flows) */
  actionstep_state: string;
  /** User ID for the request (client_${client_id}) */
  user_id: string;
  /** Request creation timestamp */
  created_at: number;
  /** Request expiration timestamp */
  expires_at: number;
}

// ============================================================================
// OAuth Consumer Flow Types
// ============================================================================

/**
 * Authorization flow initiation result
 */
export interface AuthFlowResult {
  /** Authorization URL for user redirect */
  authorizationUrl: string;
  /** State parameter for validation */
  state: string;
}

/**
 * Authorization callback handling result
 */
export interface AuthCallbackResult {
  /** Whether the callback was successful */
  success: boolean;
  /** User ID associated with the authorization */
  userId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Token exchange result
 */
export interface TokenResult {
  /** Whether the operation was successful */
  success: boolean;
  /** OAuth credentials if successful */
  credentials?: OAuthCredentials;
  /** OAuth tokens (alias for credentials for backward compatibility) */
  tokens?: OAuthCredentials;
  /** Error message if failed */
  error?: string;
}

// Import and re-export OAuthCredentials from storage types to maintain compatibility
import type { OAuthCredentials as StorageOAuthCredentials } from '../storage/StorageTypes.ts';
export type OAuthCredentials = StorageOAuthCredentials;

/**
 * User credentials with metadata
 */
export interface UserCredentials {
  /** User identifier */
  userId: string;
  /** OAuth tokens */
  tokens: OAuthCredentials;
  /** Credentials creation timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Number of token refreshes */
  refreshCount: number;
}

/**
 * Authorization request state
 */
export interface AuthorizationRequest {
  /** User identifier */
  userId: string;
  /** State parameter */
  state: string;
  /** PKCE code verifier */
  codeVerifier: string;
  /** Redirect URI */
  redirectUri: string;
  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// OAuth Validation Types
// ============================================================================

/**
 * Client validation result
 */
export interface ClientValidation {
  /** Whether the client is valid */
  valid: boolean;
  /** Client registration data if valid */
  client?: ClientRegistration;
  /** Error message if invalid */
  error?: string;
  /** Client ID if valid (for compatibility) */
  clientId?: string;
  /** Redirect URIs if valid (for compatibility) */
  redirectUris?: string[];
}

/**
 * Authorization request validation result
 */
export interface AuthorizationValidation {
  /** Whether the request is valid */
  valid: boolean;
  /** Validated client ID */
  clientId?: string | undefined;
  /** Validated redirect URI */
  redirectUri?: string | undefined;
  /** Validated scope array */
  scopes?: string[] | undefined;
  /** PKCE challenge if present */
  codeChallenge?: string | undefined;
  /** Error message if invalid */
  error?: string | undefined;
}

// ============================================================================
// OAuth Statistics Types
// ============================================================================

/**
 * Client registry statistics
 */
export interface ClientStats {
  /** Total number of registered clients */
  totalClients: number;
  /** Number of active (non-revoked) clients */
  activeClients: number;
  /** Number of revoked clients */
  revokedClients: number;
  /** Oldest client registration timestamp */
  oldestRegistration: number | null;
  /** Newest client registration timestamp */
  newestRegistration: number | null;
}

/**
 * Authentication service statistics
 */
export interface AuthStats {
  /** Total number of users */
  totalUsers: number;
  /** Number of users with active tokens */
  activeUsers: number;
  /** Number of users with expired tokens */
  expiredUsers: number;
  /** Oldest credentials timestamp */
  oldestCredentials: number | null;
  /** Newest credentials timestamp */
  newestCredentials: number | null;
  /** Total pending authorization requests */
  totalAuthRequests: number;
}

// ============================================================================
// OAuth Error Types
// ============================================================================

/**
 * Standard OAuth error codes (RFC 6749)
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'server_error'
  | 'temporarily_unavailable';

/**
 * OAuth error response
 */
export interface OAuthError {
  /** OAuth error code */
  error: OAuthErrorCode;
  /** Human-readable error description */
  error_description?: string;
  /** URI with error information */
  error_uri?: string;
  /** State parameter (if applicable) */
  state?: string;
}

// ============================================================================
// OAuth Dependencies Types
// ============================================================================

/**
 * Dependencies required by OAuth components
 */
export interface OAuthDependencies {
  /** KV storage manager */
  kvManager: any; // Will be properly typed when KVManager is imported
  /** Logger instance */
  logger?: any; // Will be properly typed when Logger is imported
  /** Credential store */
  credentialStore?: any; // Will be properly typed when CredentialStore is imported
  /** Session manager */
  sessionManager?: any; // Will be properly typed when SessionManager is imported
}

// ============================================================================
// OAuth Session Binding Types (MCP-Specific)
// ============================================================================

/**
 * MCP authorization request result
 */
export interface AuthorizationRequestResult {
  /** Generated authorization request */
  request: MCPAuthorizationRequest;
  /** ActionStep OAuth state for linking */
  actionstepState: string;
}

/**
 * Token introspection result
 */
export interface TokenIntrospection {
  /** Whether the token is active */
  active: boolean;
  /** Client ID */
  client_id?: string;
  /** User ID */
  user_id?: string;
  /** Token scope */
  scope?: string;
  /** Token expiration timestamp */
  exp?: number;
  /** Token issued at timestamp */
  iat?: number;
}

/**
 * Token mapping for monitoring/debugging
 */
export interface TokenMapping {
  /** MCP token information */
  mcpToken: {
    client_id: string;
    user_id: string;
    scope: string;
    expires_at: number;
    created_at: number;
  } | null;
  /** Whether ActionStep token exists */
  actionStepTokenExists: boolean;
}

// ============================================================================
// OAuth Authorization Context Types
// ============================================================================

/**
 * MCP authorization context for request processing
 */
export interface MCPAuthContext {
  /** Whether the request is authorized */
  authorized: boolean;
  /** Client ID */
  clientId?: string;
  /** User ID */
  userId?: string;
  /** Scopes array */
  scope?: string[];
  /** Error message if not authorized */
  error?: string;
  /** Error code for OAuth compliance */
  errorCode?: string;
  /** Action taken (e.g., token refresh) */
  actionTaken?: string;
}