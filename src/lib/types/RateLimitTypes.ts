/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  burstLimit?: number;
  windowMs?: number;
}

