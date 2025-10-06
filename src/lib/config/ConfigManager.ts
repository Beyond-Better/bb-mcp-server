/**
 * Configuration Manager - Generic configuration loading for bb-mcp-server library
 *
 * Provides flexible configuration loading from environment variables, files, and
 * programmatic sources.
 */

import '@std/dotenv/load';
import { toError } from '../utils/Error.ts';
import { LogFormat, Logger, LogLevel } from '../utils/Logger.ts';
import type {
  AppConfig,
  AuditConfig,
  ConfigLoaderOptions,
  ConfigValidationResult,
  //EnvironmentMapping,
  LoggingConfig,
  McpServerInstructionsConfig,
  OAuthConsumerConfig,
  OAuthProviderConfig,
  PluginManagerConfig,
  RateLimitConfig,
  ServerConfig,
  StorageConfig,
  ThirdPartyApiConfig,
  TransportConfig,
  TransportEventStoreChunkedConfig,
  TransportEventStoreConfig,
  TransportEventStoreType,
} from './ConfigTypes.ts';

/**
 * Generic configuration manager with environment variable support
 */
export class ConfigManager {
  private config: Partial<AppConfig> = {};
  private _logger: Logger;
  private options: ConfigLoaderOptions;

  constructor(options: ConfigLoaderOptions = {}, logger?: Logger) {
    this.options = {
      validateRequired: true,
      allowUnknownKeys: false,
      envPrefix: '',
      ...options,
    };
    // create logger with "safe" config if we didn't get a logger - IOW, don't output text format in production
    this._logger = logger || new Logger({
      level: Deno.env.get('LOG_LEVEL') as LogLevel || 'info',
      format: Deno.env.get('LOG_FORMAT') as LogFormat || 'json',
    });
  }

  set logger(logger: Logger) {
    this._logger = logger;
  }

  /**
   * Load configuration from environment variables
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      // Load environment file if specified
      if (this.options.envFile) {
        await this.loadEnvFile(this.options.envFile);
      }

      // Build configuration from environment variables
      this.config = {
        environment: this.options.environment || this.getEnvOptional('ENVIRONMENT', 'production'),
        server: this.loadServerConfig(),
        transport: this.loadTransportConfig(),
        storage: this.loadStorageConfig(),
        pluginManager: this.loadPluginsConfig(),
        mcpServerInstructionsConfig: this.loadMcpServerInstructionsConfig(),
        //transportEventStore: this.loadTransportEventStoreConfig(),
        transportEventStore: this.loadTransportEventStoreChunkedConfig(),
        logging: this.loadLoggingConfig(),
        audit: this.loadAuditConfig(),
        rateLimit: this.loadRateLimitConfig(),
      };

      // Load optional OAuth configurations
      const oauthProvider = this.loadOAuthProviderConfig();
      if (oauthProvider) {
        this.config.oauthProvider = oauthProvider;
      }
      this._logger?.info('Configuration oauthProvider:', oauthProvider);

      const oauthConsumer = this.loadOAuthConsumerConfig();
      if (oauthConsumer) {
        this.config.oauthConsumer = oauthConsumer;
      }

      const thirdpartyApiClient = this.loadThirdpartyApiConfig();
      if (thirdpartyApiClient) {
        this.config.thirdpartyApiClient = thirdpartyApiClient;
      }

      // Validate configuration
      if (this.options.validateRequired) {
        const validation = await this.validateConfig(this.config as AppConfig);
        if (!validation.isValid) {
          throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
        }

        if (validation.warnings.length > 0) {
          this._logger?.warn('ConfigManager: Configuration warnings:', validation.warnings);
        }
      }

      this._logger?.info('ConfigManager: Configuration loaded successfully');
      //this._logger?.debug('ConfigManager: Configuration loaded successfully', this.config);
      return this.config as AppConfig;
    } catch (error) {
      this._logger?.error('ConfigManager: Failed to load configuration', toError(error));
      throw error;
    }
  }

  /**
   * Get a configuration value by path with environment variable fallback
   *
   * Resolution order:
   * 1. Internal predefined config (server, transport, storage, etc.)
   * 2. Environment variable with custom prefix
   * 3. Direct environment variable (without prefix)
   * 4. Default value
   */
  get<T>(path: string, defaultValue?: T): T {
    // 1. Try internal predefined config first
    const internalValue = this.getFromInternalConfig<T>(path);
    if (internalValue !== undefined) {
      return internalValue;
    }

    // 2. Try environment variable with custom prefix
    const mcpEnvValue = Deno.env.get(`${this.options.envPrefix}${path}`);
    if (mcpEnvValue !== undefined) {
      return this.parseEnvValue<T>(mcpEnvValue);
    }

    // 3. Try direct environment variable (for consumer-specific config)
    const directEnvValue = Deno.env.get(path);
    if (directEnvValue !== undefined) {
      return this.parseEnvValue<T>(directEnvValue);
    }

    // 4. Return default value
    return defaultValue as T;
  }

  /**
   * Get value from internal predefined config structure
   */
  private getFromInternalConfig<T>(path: string): T | undefined {
    const keys = path.split('.');
    let current: any = this.config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current as T;
  }

  /**
   * Parse environment variable value with type coercion
   */
  private parseEnvValue<T>(value: string): T {
    // Handle boolean values
    if (value.toLowerCase() === 'true') return true as T;
    if (value.toLowerCase() === 'false') return false as T;

    // Handle numeric values
    const numValue = Number(value);
    if (!isNaN(numValue) && value !== '') {
      return numValue as T;
    }

    // Handle array values (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map((item) => item.trim()) as T;
    }

    // Return as string
    return value as T;
  }

  /**
   * Set a configuration value by path
   */
  set(path: string, value: unknown): void {
    const keys = path.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key && (!(key in current) || typeof current[key] !== 'object')) {
        current[key] = {};
      }
      if (key) {
        current = current[key];
      }
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }

  /**
   * Get complete configuration object
   */
  getAll(): Partial<AppConfig> {
    return { ...this.config };
  }

  /**
   * Get transport configuration
   */
  getTransportConfig(): TransportConfig | undefined {
    return this.config.transport;
  }

  /**
   * Load server configuration from environment
   */
  private loadServerConfig(): ServerConfig {
    return {
      name: this.getEnvOptional('SERVER_NAME', 'mcp-server'),
      version: this.getEnvOptional('SERVER_VERSION', '1.0.0'),
      transport: this.getEnvOptional('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http',
      httpPort: parseInt(this.getEnvOptional('HTTP_PORT', '3000')),
      httpHost: this.getEnvOptional('HTTP_HOST', 'localhost'),
      devMode: this.getEnvBoolean('DEV_MODE', false),
    };
  }

  /**
   * Load transport configuration from environment
   */
  private loadTransportConfig(): TransportConfig {
    const transport = this.getEnvOptional('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http';
    this._logger?.debug('ConfigManager: Transport Config loaded:', transport);

    const config: TransportConfig = {
      type: transport,
    };

    if (transport === 'http') {
      config.http = {
        hostname: this.getEnvOptional('HTTP_HOST', 'localhost'),
        port: parseInt(this.getEnvOptional('HTTP_PORT', '3000')),
        // Session configuration for HTTP transport (primary environment variables)
        sessionTimeout: parseInt(this.getEnvOptional('MCP_SESSION_TIMEOUT', '1800000')), // 30 * 60 * 1000 = 30 minutes default
        sessionCleanupInterval: parseInt(
          this.getEnvOptional('MCP_SESSION_CLEANUP_INTERVAL', '300000'), //5 * 60 * 1000 = 5 minutes
        ), // 5 minutes default
        maxConcurrentSessions: parseInt(this.getEnvOptional('MCP_MAX_CONCURRENT_SESSIONS', '1000')),
        enableSessionPersistence: this.getEnvBoolean('MCP_SESSION_PERSISTENCE_ENABLED', true),
        enableSessionRestore: this.getEnvBoolean('MCP_SESSION_RESTORE_ENABLED', true),
        requestTimeout: parseInt(this.getEnvOptional('MCP_REQUEST_TIMEOUT', '30000')), // 30 seconds default
        maxRequestSize: parseInt(this.getEnvOptional('MCP_MAX_REQUEST_SIZE', '1048576')), // 1024 * 1024 = 1MB default
        cors: {
          enabled: this.getEnvBoolean('HTTP_CORS_ENABLED', true),
          origins: this.getEnvArray('HTTP_CORS_ORIGINS', ['*']),
          methods: this.getEnvArray('HTTP_CORS_METHODS', ['GET', 'POST', 'PUT', 'DELETE']),
          headers: this.getEnvArray('HTTP_CORS_HEADERS', []),
        },
        preserveCompatibilityMode: this.getEnvBoolean('PRESERVE_COMPATIBILITY_MODE', true),
        allowInsecure: this.getEnvBoolean('HTTP_ALLOW_INSECURE', false),
        // Optional transport persistence settings (for compatibility)
        enableTransportPersistence: this.getEnvBoolean('MCP_TRANSPORT_PERSISTENCE_ENABLED', false),
        // 🔒 NEW: Authentication configuration from environment
        enableAuthentication: this.get('MCP_AUTH_HTTP_ENABLED', 'true') === 'true',
        skipAuthentication: (this.get('MCP_AUTH_HTTP_SKIP', 'false') as string) === 'true',
        requireAuthentication: this.get('MCP_AUTH_HTTP_REQUIRE', 'true') === 'true',
      };
    } else {
      config.stdio = {
        enableLogging: this.getEnvBoolean('STDIO_LOGGING_ENABLED', true),
        bufferSize: parseInt(this.getEnvOptional('STDIO_BUFFER_SIZE', '8192')),
        encoding: this.getEnvOptional('STDIO_ENCODING', 'utf8'),
        // 🔒 STDIO authentication (discouraged by MCP spec)
        enableAuthentication: this.getEnvBoolean('MCP_AUTH_STDIO_ENABLED', false),
        skipAuthentication: this.getEnvBoolean('MCP_AUTH_STDIO_SKIP', false),
      };
    }

    // Add session configuration (applies to both HTTP and STDIO if needed)
    config.session = {
      maxAge: parseInt(this.getEnvOptional('SESSION_MAX_AGE', '1800000')), // 30 minutes default
      cleanupInterval: parseInt(this.getEnvOptional('SESSION_CLEANUP_INTERVAL', '300000')), // 5 minutes default
      persistToDisk: this.getEnvBoolean('SESSION_PERSIST_TO_DISK', true),
      encryptSessionData: this.getEnvBoolean('SESSION_ENCRYPT_DATA', false),
    };

    return config;
  }

  /**
   * Load storage configuration from environment
   */
  private loadStorageConfig(): StorageConfig {
    return {
      denoKvPath: this.getEnvOptional('STORAGE_DENO_KV_PATH', './data/mcp-server.db'),
      enablePersistence: this.getEnvBoolean('STORAGE_PERSISTENCE_ENABLED', true),
      cleanupInterval: parseInt(this.getEnvOptional('STORAGE_CLEANUP_INTERVAL', '3600000')), // 1 hour
    };
  }

  /**
   * MCP Server Instructions configuration from environment
   */
  private loadMcpServerInstructionsConfig(): McpServerInstructionsConfig {
    return {
      instructionsContent: this.getEnvOptional('MCP_SERVER_INSTRUCTIONS', ''),
      instructionsFilePath: this.getEnvOptional('MCP_INSTRUCTIONS_FILE', ''),
    };
  }

  /**
   * Load base transport event store configuration from environment
   */
  private loadTransportEventStoreConfig(): TransportEventStoreConfig {
    return {
      //useChunkedStorage: this.getEnvBoolean('TRANSPORT_USE_CHUNKED_STORAGE', true),
      storageType: this.getEnvOptional(
        'TRANSPORT_STORAGE_TYPE',
        'chunked',
      ) as TransportEventStoreType,

      monitoring: {
        enableDebugLogging: this.getEnvBoolean('TRANSPORT_CHUNKED_DEBUG_LOGGING', false),
      },

      maintenance: {
        enableAutoCleanup: this.getEnvBoolean('TRANSPORT_AUTO_CLEANUP_ENABLED', true),
        keepEventCount: parseInt(
          this.getEnvOptional('TRANSPORT_KEEP_EVENT_COUNT', '1000'),
          10,
        ),
        cleanupIntervalMs: parseInt(
          this.getEnvOptional('TRANSPORT_CLEANUP_INTERVAL_MS', '86400000'),
          10,
        ),
      },
    };
  }

  /**
   * Load chunked transport event store configuration from environment
   * Includes all base config plus chunked-specific settings
   */
  private loadTransportEventStoreChunkedConfig(): TransportEventStoreChunkedConfig {
    const baseConfig = this.loadTransportEventStoreConfig();

    return {
      ...baseConfig,

      chunking: {
        maxChunkSize: parseInt(
          this.getEnvOptional('TRANSPORT_MAX_CHUNK_SIZE', '61440'),
          10,
        ),
        maxMessageSize: parseInt(
          this.getEnvOptional('TRANSPORT_MAX_MESSAGE_SIZE', '10485760'),
          10,
        ),
      },

      compression: {
        enable: this.getEnvBoolean('TRANSPORT_COMPRESSION_ENABLED', true),
        threshold: parseInt(
          this.getEnvOptional('TRANSPORT_COMPRESSION_THRESHOLD', '1024'),
          10,
        ),
      },

      monitoring: {
        ...baseConfig.monitoring,
        logCompressionStats: this.getEnvBoolean('TRANSPORT_LOG_COMPRESSION_STATS', true),
      },
    };
  }

  /**
   * Load logging configuration from environment
   */
  private loadLoggingConfig(): LoggingConfig {
    return {
      level: this.getEnvOptional('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
      format: this.getEnvOptional('LOG_FORMAT', 'text') as 'text' | 'json',
    };
  }

  /**
   * Load audit configuration from environment
   */
  private loadAuditConfig(): AuditConfig {
    return {
      enabled: this.getEnvBoolean('AUDIT_ENABLED', true),
      logFile: this.getEnvOptional('AUDIT_LOG_FILE', './logs/audit.log'),
      retentionDays: parseInt(this.getEnvOptional('AUDIT_RETENTION_DAYS', '90')),
      logCalls: {
        api: this.getEnvBoolean('AUDIT_LOG_CALLS_API', true),
        auth: this.getEnvBoolean('AUDIT_LOG_CALLS_AUTH', true),
        workflow_execution: this.getEnvBoolean('AUDIT_LOG_CALLS_WORKFLOW_EXECUTION', true),
        workflow_operation: this.getEnvBoolean('AUDIT_LOG_CALLS_WORKFLOW_OPERATION', true),
        tools: this.getEnvBoolean('AUDIT_LOG_CALLS_TOOLS', true),
        system: this.getEnvBoolean('AUDIT_LOG_CALLS_SYSTEM', true),
        custom: this.getEnvBoolean('AUDIT_LOG_CALLS_CUSTOM', true),
      },
    };
  }

  /**
   * Load rate limiting configuration from environment
   */
  private loadRateLimitConfig(): RateLimitConfig {
    return {
      enabled: this.getEnvBoolean('RATE_LIMIT_ENABLED', false),
      requestsPerMinute: parseInt(this.getEnvOptional('RATE_LIMIT_REQUESTS_PER_MINUTE', '60')),
      burstLimit: parseInt(this.getEnvOptional('RATE_LIMIT_BURST', '10')),
      windowMs: parseInt(this.getEnvOptional('RATE_LIMIT_WINDOW_MS', '60000')), // 1 minute
    };
  }

  /**
   * Load OAuth provider configuration from environment (optional)
   * Returns the nested structure expected by OAuthProvider constructor
   */
  private loadOAuthProviderConfig(): OAuthProviderConfig {
    const clientId = this.getEnvOptional('OAUTH_PROVIDER_CLIENT_ID', 'bb-mcp-server');
    const clientSecret = this.getEnvOptional('OAUTH_PROVIDER_CLIENT_SECRET', 'super-secret');
    const redirectUri = this.getEnvOptional(
      'OAUTH_PROVIDER_REDIRECT_URI',
      'http://localhost:3000/oauth/callback',
    );

    if (clientId === 'bb-mcp-server' || clientSecret === 'super-secret') {
      this._logger?.warn(
        'ConfigManager: Using default values for OAUTH_PROVIDER_CLIENT_ID or OAUTH_PROVIDER_CLIENT_SECRET - change them before deploying to production',
      );
    }

    return {
      issuer: this.getEnvOptional('OAUTH_PROVIDER_ISSUER', 'http://localhost:3000'),
      clientId,
      clientSecret,
      redirectUri,

      tokens: {
        accessTokenExpiryMs: parseInt(
          this.getEnvOptional('OAUTH_PROVIDER_TOKEN_EXPIRATION', '3600000'),
          10,
        ),
        refreshTokenExpiryMs: parseInt(
          this.getEnvOptional('OAUTH_PROVIDER_REFRESH_TOKEN_EXPIRATION', '2592000000'),
          10,
        ),
        authorizationCodeExpiryMs: parseInt(
          this.getEnvOptional('OAUTH_PROVIDER_CODE_EXPIRATION', '600000'),
          10,
        ),
      },

      clients: {
        enableDynamicRegistration: this.getEnvBoolean('OAUTH_PROVIDER_DYNAMIC_CLIENT_REG', true),
        requireHTTPS: this.getEnvBoolean('OAUTH_PROVIDER_REQUIRE_HTTPS', false),
        allowedRedirectHosts: this.getEnvArray('OAUTH_PROVIDER_ALLOWED_HOSTS', ['localhost']),
      },

      authorization: {
        supportedGrantTypes: ['authorization_code', 'refresh_token'],
        supportedResponseTypes: ['code'],
        supportedScopes: ['all', 'read', 'write', 'admin'],
        enablePKCE: this.getEnvBoolean('OAUTH_PROVIDER_PKCE', true),
        requirePKCE: false,
      },
    };
  }

  /**
   * Load OAuth consumer configuration from environment (optional)
   */
  private loadOAuthConsumerConfig(): OAuthConsumerConfig | null {
    const providerId = this.getEnvOptional('OAUTH_CONSUMER_PROVIDER_ID', '');

    // Early return if no provider ID - skip entire OAuth config
    if (!providerId) {
      return null;
    }

    const clientId = this.getEnvRequired('OAUTH_CONSUMER_CLIENT_ID');
    const clientSecret = this.getEnvRequired('OAUTH_CONSUMER_CLIENT_SECRET');
    const authUrl = this.getEnvRequired('OAUTH_CONSUMER_AUTH_URL');
    const tokenUrl = this.getEnvRequired('OAUTH_CONSUMER_TOKEN_URL');
    const redirectUri = this.getEnvRequired('OAUTH_CONSUMER_REDIRECT_URI');

    const scopes = this.getEnvArray('OAUTH_CONSUMER_SCOPES', []);

    const tokenRefreshBufferMinutes = parseInt(
      this.getEnvOptional('OAUTH_CONSUMER_TOKEN_REFRESH_BUFFER_MINUTES', '5'),
    );
    const maxTokenRefreshRetries = parseInt(
      this.getEnvOptional('OAUTH_CONSUMER_MAX_TOKEN_REFRESH_RETRIES', '3'),
    );

    const customHeaders = this.getEnvRecord('OAUTH_CONSUMER_CUSTOM_HEADERS', {});

    return {
      providerId,
      clientId,
      clientSecret,
      authUrl,
      tokenUrl,
      redirectUri,
      scopes,
      tokenRefreshBufferMinutes,
      maxTokenRefreshRetries,
      customHeaders,
    };
  }

  /**
   * Load third-party API configuration from environment (optional)
   */
  private loadThirdpartyApiConfig(): ThirdPartyApiConfig | null {
    const providerId = this.getEnvOptional('THIRDPARTY_API_PROVIDER_ID', '');

    // Early return if no provider ID - skip entire third-party api config
    if (!providerId) {
      return null;
    }

    const version = this.getEnvRequired('THIRDPARTY_API_VERSION');
    const baseUrl = this.getEnvRequired('THIRDPARTY_API_BASE_URL');
    const timeout = parseInt(this.getEnvOptional('THIRDPARTY_API_TIMEOUT', '5000'));
    const retryAttempts = parseInt(this.getEnvOptional('THIRDPARTY_API_RETRY_ATTEMPTS', '3'));
    const retryDelayMs = parseInt(this.getEnvOptional('THIRDPARTY_API_RETRY_DELAY', '1000'));

    return {
      providerId,
      version,
      baseUrl,
      timeout,
      retryAttempts,
      retryDelayMs,
    };
  }

  /**
   * Load plugins configuration from environment
   */
  loadPluginsConfig(): PluginManagerConfig {
    return {
      paths: this.getEnvArray('PLUGINS_DISCOVERY_PATHS', ['./plugins']),
      autoload: this.getEnvBoolean('PLUGINS_AUTOLOAD', true),
      watchForChanges: this.getEnvBoolean('PLUGINS_WATCH_CHANGES', false),
      allowedPlugins:
        this.getEnvOptional('PLUGINS_ALLOWED_LIST', '')?.split(',').map((p) => p.trim()).filter(
          (p) => p.length > 0,
        ) || undefined,
      blockedPlugins: this.getEnvArray('PLUGINS_BLOCKED_LIST', []),
    };
  }

  /**
   * Validate the loaded configuration
   */
  private async validateConfig(config: AppConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate server transport
    if (!['stdio', 'http'].includes(config.transport.type)) {
      errors.push('Invalid transport type, must be "stdio" or "http"');
    }

    // Validate logging level
    if (!['debug', 'info', 'warn', 'error'].includes(config.logging.level)) {
      errors.push('Invalid log level, must be one of: debug, info, warn, error');
    }

    // Validate URLs if OAuth is configured
    if (config.oauthConsumer) {
      try {
        new URL(config.oauthConsumer.authUrl);
        new URL(config.oauthConsumer.tokenUrl);
        new URL(config.oauthConsumer.redirectUri);
      } catch {
        errors.push('Invalid URL format in OAuth consumer configuration');
      }
    }

    // Validate rate limit configuration
    if (config.rateLimit.enabled && config.rateLimit.requestsPerMinute <= 0) {
      errors.push('Rate limit requests per minute must be a positive number');
    }

    // Create data directory if it doesn't exist
    try {
      const kvDir = config.storage.denoKvPath.substring(
        0,
        config.storage.denoKvPath.lastIndexOf('/'),
      );
      if (kvDir) {
        await Deno.mkdir(kvDir, { recursive: true });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Cannot create data directory: ${errorMessage}`);
    }

    // Add warnings for potential issues
    if (config.server.devMode) {
      warnings.push('Development mode is enabled - not suitable for production');
    }

    if (config.transport.type === 'http' && !config.oauthProvider) {
      warnings.push('HTTP transport without OAuth provider may have limited security');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Load environment file
   */
  private async loadEnvFile(envFile: string): Promise<void> {
    try {
      // Note: @std/dotenv/load automatically loads .env file at import time
      // For custom env files, we can use the dotenv library directly
      const { load } = await import('@std/dotenv');
      await load({ envPath: envFile, export: true });
    } catch (error) {
      this._logger?.warn('ConfigManager: Could not load environment file', { envFile, error });
    }
  }

  /**
   * Helper to get required environment variable
   */
  private getEnvRequired(key: string): string {
    const value = Deno.env.get(`${this.options.envPrefix}${key}`);
    if (!value) {
      throw new Error(`Required environment variable ${this.options.envPrefix}${key} is not set`);
    }
    return value;
  }

  /**
   * Helper to get optional environment variable with default
   */
  private getEnvOptional(key: string, defaultValue: string): string {
    return Deno.env.get(`${this.options.envPrefix}${key}`) ?? defaultValue;
  }

  /**
   * Helper to get boolean environment variable
   */
  private getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = Deno.env.get(`${this.options.envPrefix}${key}`)?.toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return defaultValue;
  }

  /**
   * Helper to get array from environment variable (comma-separated)
   */
  private getEnvArray(key: string, defaultValue: string[]): string[] {
    const value = Deno.env.get(`${this.options.envPrefix}${key}`);
    if (!value) return defaultValue;
    return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  }

  /**
   * Helper to get Record from environment variable (key=value,key2=value2)
   *
   * **Usage examples:**
   * • `KEY_VALUE_PAIRS=name=john,age=30,city=NYC`
   * • `HEADERS=authorization=Bearer token,content-type=application/json`
   * • `CONFIG=debug=true,timeout=5000,env=production`
   */
  private getEnvRecord(
    key: string,
    defaultValue: Record<string, string> = {},
  ): Record<string, string> {
    const value = Deno.env.get(`${this.options.envPrefix}${key}`);
    if (!value) return defaultValue;

    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.includes('='))
      .reduce((acc, item) => {
        const [k, ...rest] = item.split('=');
        if (k !== undefined) {
          acc[k.trim()] = rest.join('=').trim(); // Handles values containing '='
        }
        return acc;
      }, {} as Record<string, string>);
  }

  /**
   * Helper to get Record from JSON environment variable
   *
   * Usage: `CONFIG={"debug":"true","timeout":"5000"}`
   */
  /*
  private getEnvRecordJSON(
    key: string,
    defaultValue: Record<string, string> = {},
  ): Record<string, string> {
    const value = Deno.env.get(`${this.options.envPrefix}${key}`);
    if (!value) return defaultValue;

    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
   */
}
