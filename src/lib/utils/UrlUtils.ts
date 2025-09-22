/**
 * URL utilities for handling reverse proxy scenarios
 * 
 * Provides utility functions for reconstructing original URLs from proxy headers
 * when running behind reverse proxies like nginx, Apache, Cloudflare, etc.
 */

/**
 * Reconstruct the original request URL from proxy headers
 * Fixes the HTTP/HTTPS scheme issue when behind nginx reverse proxy
 * 
 * @param request - The incoming HTTP request
 * @returns Reconstructed URL with proper protocol and host
 */
export function reconstructOriginalUrl(request: Request): URL {
  // Get the original protocol from nginx proxy headers
  const forwardedProto = request.headers.get('x-forwarded-proto') || 
                        request.headers.get('x-forwarded-protocol');
  
  // Get the original host from nginx proxy headers
  const forwardedHost = request.headers.get('x-forwarded-host') || 
                       request.headers.get('host');
  
  // Parse the current URL to get path and query parameters
  const currentUrl = new URL(request.url);
  
  // Reconstruct with proper protocol and host
  const protocol = `${forwardedProto}:` || currentUrl.protocol;
  const host = forwardedHost || currentUrl.host;
  
  const reconstructedUrl = new URL(
    `${protocol}//${host}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
  );
  
  return reconstructedUrl;
}

/**
 * Check if a request is coming through a reverse proxy
 * 
 * @param request - The incoming HTTP request
 * @returns true if proxy headers are detected
 */
export function isProxiedRequest(request: Request): boolean {
  return !!(request.headers.get('x-forwarded-proto') ||
           request.headers.get('x-forwarded-protocol') ||
           request.headers.get('x-forwarded-host'));
}

/**
 * Get proxy information from headers for debugging
 * 
 * @param request - The incoming HTTP request
 * @returns Proxy information object
 */
export function getProxyInfo(request: Request): {
  isProxied: boolean;
  forwardedProto?: string;
  forwardedHost?: string;
  originalUrl: string;
  reconstructedUrl: string;
} {
  const isProxied = isProxiedRequest(request);
  const forwardedProto = request.headers.get('x-forwarded-proto') || 
                        request.headers.get('x-forwarded-protocol');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const originalUrl = request.url;
  const reconstructedUrl = reconstructOriginalUrl(request).toString();
  
  const result: {
    isProxied: boolean;
    forwardedProto?: string;
    forwardedHost?: string;
    originalUrl: string;
    reconstructedUrl: string;
  } = {
    isProxied,
    originalUrl,
    reconstructedUrl,
  };
  
  // Only include proxy headers if they exist
  if (forwardedProto) {
    result.forwardedProto = forwardedProto;
  }
  if (forwardedHost) {
    result.forwardedHost = forwardedHost;
  }
  
  return result;
}