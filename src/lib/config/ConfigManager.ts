/**
 * Configuration Manager - Generic configuration loading for bb-mcp-server library
 *
 * Provides flexible configuration loading from environment variables, files, and
 * programmatic sources.
 */

import '@std/dotenv/load';
import { toError } from '../utils/Error.ts';
import type {
  AppConfig,
  AuditConfig,
  ConfigLoaderOptions,
  ConfigValidationResult,
  EnvironmentMapping,
  LoggingConfig,
  RateLimitConfig,
  ServerConfig,
  StorageConfig,
  TransportConfig,
} from './ConfigTypes.ts';

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error, data?: unknown): void;
}

/**
 * Generic configuration manager with environment variable support
 */
export class ConfigManager {
  private config: Partial<AppConfig> = {};
  private logger: Logger | undefined;
  private options: ConfigLoaderOptions;

  constructor(options: ConfigLoaderOptions = {}, logger?: Logger) {
    this.options = {
      validateRequired: true,
      allowUnknownKeys: false,
      envPrefix: '',
      ...options,
    };
    this.logger = logger;
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
        server: this.loadServerConfig(),
        transport: this.loadTransportConfig(),
        storage: this.loadStorageConfig(),
        logging: this.loadLoggingConfig(),
        audit: this.loadAuditConfig(),
        rateLimit: this.loadRateLimitConfig(),
      };

      // Load optional OAuth configurations
      const oauthProvider = this.loadOAuthProviderConfig();
      if (oauthProvider) {
        this.config.oauthProvider = oauthProvider;
      }

      const oauthConsumer = this.loadOAuthConsumerConfig();
      if (oauthConsumer) {
        this.config.oauthConsumer = oauthConsumer;
      }

      // Validate configuration
      if (this.options.validateRequired) {
        const validation = await this.validateConfig(this.config as AppConfig);
        if (!validation.isValid) {
          throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
        }

        if (validation.warnings.length > 0) {
          this.logger?.warn('Configuration warnings:', validation.warnings);
        }
      }

      this.logger?.info('ConfigManager: Configuration loaded successfully');
      return this.config as AppConfig;
    } catch (error) {
      this.logger?.error('ConfigManager: Failed to load configuration', toError(error));
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
      httpPort: parseInt(this.getEnvOptional('HTTP_PORT', '3001')),
      httpHost: this.getEnvOptional('HTTP_HOST', 'localhost'),
      devMode: this.getEnvBoolean('DEV_MODE', false),
    };
  }

  /**
   * Load transport configuration from environment
   */
  private loadTransportConfig(): TransportConfig {
    const transport = this.getEnvOptional('MCP_TRANSPORT', 'stdio') as 'stdio' | 'http';
    this.logger?.debug('Transport Config loaded:', transport);

    const config: TransportConfig = {
      type: transport,
    };

    if (transport === 'http') {
      config.http = {
        hostname: this.getEnvOptional('HTTP_HOST', 'localhost'),
        port: parseInt(this.getEnvOptional('HTTP_PORT', '3001')),
        // Session configuration for HTTP transport (primary environment variables)
        sessionTimeout: parseInt(this.getEnvOptional('MCP_SESSION_TIMEOUT', '1800000')), // 30 minutes default
        sessionCleanupInterval: parseInt(
          this.getEnvOptional('MCP_SESSION_CLEANUP_INTERVAL', '300000'),
        ), // 5 minutes default
        maxConcurrentSessions: parseInt(this.getEnvOptional('MCP_MAX_CONCURRENT_SESSIONS', '1000')),
        enableSessionPersistence: this.getEnvBoolean('MCP_ENABLE_SESSION_PERSISTENCE', true),
        requestTimeout: parseInt(this.getEnvOptional('MCP_REQUEST_TIMEOUT', '30000')), // 30 seconds default
        maxRequestSize: parseInt(this.getEnvOptional('MCP_MAX_REQUEST_SIZE', '1048576')), // 1MB default
        enableCORS: this.getEnvBoolean('HTTP_CORS_ENABLED', true),
        corsOrigins: this.getEnvArray('HTTP_CORS_ORIGINS', ['*']),
        preserveCompatibilityMode: this.getEnvBoolean('PRESERVE_COMPATIBILITY_MODE', true),
        allowInsecure: this.getEnvBoolean('HTTP_ALLOW_INSECURE', false),
        // Optional transport persistence settings (for compatibility)
        enableTransportPersistence: this.getEnvBoolean('MCP_ENABLE_TRANSPORT_PERSISTENCE', false),
        sessionRestoreEnabled: this.getEnvBoolean('MCP_SESSION_RESTORE_ENABLED', false),
      };
    } else {
      config.stdio = {
        enableLogging: this.getEnvBoolean('STDIO_ENABLE_LOGGING', true),
        bufferSize: parseInt(this.getEnvOptional('STDIO_BUFFER_SIZE', '8192')),
        encoding: this.getEnvOptional('STDIO_ENCODING', 'utf8'),
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
      denoKvPath: this.getEnvOptional('DENO_KV_PATH', './data/mcp-server.db'),
      enablePersistence: this.getEnvBoolean('STORAGE_PERSISTENCE', true),
      cleanupInterval: parseInt(this.getEnvOptional('STORAGE_CLEANUP_INTERVAL', '3600000')), // 1 hour
    };
  }

  /**
   * Load logging configuration from environment
   */
  private loadLoggingConfig(): LoggingConfig {
    const file = Deno.env.get(`${this.options.envPrefix}LOG_FILE`);
    return {
      level: this.getEnvOptional('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
      format: this.getEnvOptional('LOG_FORMAT', 'text') as 'text' | 'json',
      ...(file && { file }),
    };
  }

  /**
   * Load audit configuration from environment
   */
  private loadAuditConfig(): AuditConfig {
    const logFile = Deno.env.get(`${this.options.envPrefix}AUDIT_LOG_FILE`);
    return {
      enabled: this.getEnvBoolean('AUDIT_ENABLED', true),
      logAllApiCalls: this.getEnvBoolean('AUDIT_LOG_ALL_API_CALLS', true),
      ...(logFile && { logFile }),
      retentionDays: parseInt(this.getEnvOptional('AUDIT_RETENTION_DAYS', '90')),
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
   */
  private loadOAuthProviderConfig() {
    const clientId = Deno.env.get(`${this.options.envPrefix}OAUTH_PROVIDER_CLIENT_ID`);
    const clientSecret = Deno.env.get(`${this.options.envPrefix}OAUTH_PROVIDER_CLIENT_SECRET`);
    const redirectUri = Deno.env.get(`${this.options.envPrefix}OAUTH_PROVIDER_REDIRECT_URI`);

    if (!clientId || !clientSecret || !redirectUri) {
      return null;
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      issuer: this.getEnvOptional('OAUTH_PROVIDER_ISSUER', 'http://localhost:3001'),
      enablePKCE: this.getEnvBoolean('OAUTH_PROVIDER_PKCE', true),
      enableDynamicRegistration: this.getEnvBoolean('OAUTH_PROVIDER_DYNAMIC_REGISTRATION', false),
      tokenExpirationMs: parseInt(
        this.getEnvOptional('OAUTH_PROVIDER_TOKEN_EXPIRATION', '3600000'),
      ), // 1 hour
      refreshTokenExpirationMs: parseInt(
        this.getEnvOptional('OAUTH_PROVIDER_REFRESH_TOKEN_EXPIRATION', '2592000000'),
      ), // 30 days
    };
  }

  /**
   * Load plugins configuration from environment
   */
  loadPluginsConfig(): {
    paths: string[];
    autoload: boolean;
    watchForChanges: boolean;
    allowedPlugins?: string[];
    blockedPlugins?: string[];
  } {
    return {
      paths: this.getEnvArray('PLUGINS_DISCOVERY_PATHS', ['./plugins', './workflows']),
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
   * Load OAuth consumer configuration from environment (optional)
   */
  private loadOAuthConsumerConfig() {
    const provider = Deno.env.get(`${this.options.envPrefix}OAUTH_CONSUMER_PROVIDER`);
    const clientId = Deno.env.get(`${this.options.envPrefix}OAUTH_CONSUMER_CLIENT_ID`);
    const clientSecret = Deno.env.get(`${this.options.envPrefix}OAUTH_CONSUMER_CLIENT_SECRET`);
    const authUrl = Deno.env.get(`${this.options.envPrefix}OAUTH_CONSUMER_AUTH_URL`);
    const tokenUrl = Deno.env.get(`${this.options.envPrefix}OAUTH_CONSUMER_TOKEN_URL`);
    const redirectUri = Deno.env.get(`${this.options.envPrefix}OAUTH_CONSUMER_REDIRECT_URI`);

    if (!provider || !clientId || !clientSecret || !authUrl || !tokenUrl || !redirectUri) {
      return null;
    }

    return {
      provider,
      clientId,
      clientSecret,
      authUrl,
      tokenUrl,
      redirectUri,
      scopes: this.getEnvArray('OAUTH_CONSUMER_SCOPES', []),
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
      this.logger?.warn('ConfigManager: Could not load environment file', { envFile, error });
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
}
