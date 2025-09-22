/**
 * Error Pages - Error response and HTML page generation
 *
 * Provides error response generation for both JSON API responses and HTML error pages
 * for OAuth flows and general server errors. Handles XSS prevention and user-friendly
 * error presentation.
 *
 * Extracted from: actionstep-mcp-server/src/server/HttpServer.ts error handling methods
 */

import type { Logger } from '../../types/library.types.ts';
import type { HttpServerConfig } from './HttpServer.ts';

/**
 * Error page generation and error response handling
 * 
 * Provides comprehensive error handling for both API and browser clients
 * with security-conscious HTML generation and structured JSON responses.
 */
export class ErrorPages {
  private config: HttpServerConfig;
  private logger: Logger | undefined;
  
  constructor(config: HttpServerConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger;
    
    this.logger?.info('ErrorPages: Initialized', {
      serverName: this.config.name,
      serverVersion: this.config.version,
    });
  }
  
  /**
   * Generate standard JSON error response
   */
  generateErrorResponse(error: Error | string, status = 500): Response {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log error for monitoring  
    this.logger?.error('ErrorPages: Generating error response', error instanceof Error ? error : new Error(errorMessage), {
      status,
      message: errorMessage,
      stack: errorStack,
    });
    
    const errorData = {
      error: {
        message: this.getPublicErrorMessage(status),
        status: status,
        details: errorMessage,
        timestamp: new Date().toISOString(),
        server: {
          name: this.config.name,
          version: this.config.version,
        },
      },
    };
    
    return new Response(JSON.stringify(errorData, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  /**
   * Generate 404 Not Found response
   */
  generateNotFoundResponse(path: string): Response {
    this.logger?.warn('ErrorPages: 404 Not Found', { path });
    
    return new Response(JSON.stringify({
      error: {
        message: 'Not Found',
        status: 404,
        details: `Endpoint ${path} not found`,
        timestamp: new Date().toISOString(),
        server: {
          name: this.config.name,
          version: this.config.version,
        },
      },
    }, null, 2), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  /**
   * Generate HTML error page for OAuth and browser flows
   */
  generateErrorPage(error: string, title?: string): Response {
    const pageTitle = title || 'Server Error';
    const serverName = this.config.name || 'MCP Server';
    
    this.logger?.warn('ErrorPages: Generating HTML error page', {
      title: pageTitle,
      error,
    });
    
    const errorPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(pageTitle)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .error-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            animation: slideUp 0.5s ease-out;
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        
        .error-title {
            color: #dc3545;
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        
        .error-message {
            color: #6c757d;
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 24px;
            word-break: break-word;
        }
        
        .error-details {
            background: #f8f9fa;
            border-left: 4px solid #dc3545;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
            border-radius: 4px;
        }
        
        .error-details strong {
            color: #dc3545;
            display: block;
            margin-bottom: 8px;
        }
        
        .error-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-block;
        }
        
        .btn-primary {
            background: #007bff;
            color: white;
        }
        
        .btn-primary:hover {
            background: #0056b3;
            transform: translateY(-1px);
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #545b62;
            transform: translateY(-1px);
        }
        
        .server-info {
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            font-size: 12px;
            color: #868e96;
        }
        
        .server-info .server-name {
            font-weight: 500;
            color: #495057;
        }
        
        @media (max-width: 480px) {
            .error-container {
                padding: 24px;
            }
            
            .error-title {
                font-size: 24px;
            }
            
            .error-icon {
                font-size: 48px;
            }
            
            .btn {
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">❌</div>
        <h1 class="error-title">${this.escapeHtml(pageTitle)}</h1>
        <p class="error-message">
            We apologize, but something went wrong while processing your request.
        </p>
        
        <div class="error-details">
            <strong>Error Details:</strong>
            ${this.escapeHtml(error)}
        </div>
        
        <div class="error-actions">
            <button class="btn btn-primary" onclick="window.history.back()">
                ← Go Back
            </button>
            <button class="btn btn-secondary" onclick="window.close()">
                Close Window
            </button>
        </div>
        
        <div class="server-info">
            <div class="server-name">${this.escapeHtml(serverName)}</div>
            <div>Version ${this.escapeHtml(this.config.version)}</div>
            <div>${new Date().toISOString()}</div>
        </div>
    </div>
    
    <script>
        // Auto-close after 30 seconds if opened as popup
        if (window.opener && window.opener !== window) {
            let countdown = 30;
            const originalTitle = document.title;
            const updateCountdown = () => {
                if (countdown > 0) {
                    document.title = originalTitle.split(' (')[0] + ' (Auto-close in ' + countdown + 's)';
                    countdown--;
                    setTimeout(updateCountdown, 1000);
                } else {
                    window.close();
                }
            };
            
            // Start countdown after 5 seconds
            setTimeout(updateCountdown, 5000);
        }
        
        // Focus management for accessibility
        document.addEventListener('DOMContentLoaded', () => {
            const firstButton = document.querySelector('.btn');
            if (firstButton) {
                firstButton.focus();
            }
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (window.opener) {
                    window.close();
                } else {
                    window.history.back();
                }
            }
        });
    </script>
</body>
</html>`;
    
    return new Response(errorPage, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  
  /**
   * Generate OAuth-specific error page
   */
  generateOAuthErrorPage(error: string): Response {
    return this.generateErrorPage(error, 'Authentication Error');
  }
  
  /**
   * Generate method not allowed response
   */
  generateMethodNotAllowedResponse(method: string, path: string, allowedMethods?: string[]): Response {
    this.logger?.warn('ErrorPages: Method not allowed', {
      method,
      path,
      allowedMethods,
    });
    
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (allowedMethods && allowedMethods.length > 0) {
      headers['Allow'] = allowedMethods.join(', ');
    }
    
    return new Response(JSON.stringify({
      error: {
        message: 'Method Not Allowed',
        status: 405,
        details: `Method ${method} not allowed for ${path}`,
        allowed_methods: allowedMethods,
        timestamp: new Date().toISOString(),
      },
    }, null, 2), {
      status: 405,
      headers,
    });
  }
  
  /**
   * Generate rate limit exceeded response
   */
  generateRateLimitResponse(retryAfter?: number): Response {
    this.logger?.warn('ErrorPages: Rate limit exceeded', { retryAfter });
    
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    if (retryAfter) {
      headers['Retry-After'] = retryAfter.toString();
    }
    
    return new Response(JSON.stringify({
      error: {
        message: 'Too Many Requests',
        status: 429,
        details: 'Rate limit exceeded. Please try again later.',
        retry_after: retryAfter,
        timestamp: new Date().toISOString(),
      },
    }, null, 2), {
      status: 429,
      headers,
    });
  }
  
  /**
   * Get public error message based on status code
   */
  private getPublicErrorMessage(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 405:
        return 'Method Not Allowed';
      case 429:
        return 'Too Many Requests';
      case 500:
        return 'Internal Server Error';
      case 502:
        return 'Bad Gateway';
      case 503:
        return 'Service Unavailable';
      case 504:
        return 'Gateway Timeout';
      default:
        return status >= 400 && status < 500 ? 'Client Error' : 'Server Error';
    }
  }
  
  /**
   * Escape HTML to prevent XSS attacks
   */
  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  /**
   * Generate maintenance mode page
   */
  generateMaintenancePage(message?: string): Response {
    const maintenanceMessage = message || 'The server is currently undergoing maintenance. Please try again later.';
    
    this.logger?.info('ErrorPages: Serving maintenance page');
    
    const maintenancePage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance - ${this.escapeHtml(this.config.name)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
        }
        .maintenance-container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            max-width: 500px;
        }
        .maintenance-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .maintenance-title {
            color: #e17055;
            font-size: 24px;
            margin-bottom: 16px;
        }
        .maintenance-message {
            color: #636e72;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="maintenance-container">
        <div class="maintenance-icon">Ὦ0️</div>
        <h1 class="maintenance-title">Maintenance in Progress</h1>
        <p class="maintenance-message">${this.escapeHtml(maintenanceMessage)}</p>
    </div>
</body>
</html>`;
    
    return new Response(maintenancePage, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Retry-After': '3600', // 1 hour
      },
    });
  }
}