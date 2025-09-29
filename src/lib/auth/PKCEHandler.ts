/**
 * PKCE Handler - Proof Key for Code Exchange Implementation (RFC 7636)
 *
 * 🔒 SECURITY-CRITICAL: This component implements PKCE (Proof Key for Code Exchange)
 * to prevent authorization code interception attacks in OAuth 2.0 flows. All
 * cryptographic operations are preserved exactly from OAuthClientService.ts.
 *
 * Security Requirements:
 * - RFC 7636 full compliance for PKCE implementation
 * - SHA-256 digest for S256 code challenge method
 * - Base64URL encoding without padding for challenges
 * - Proper code verifier validation (length and character set)
 * - Secure code challenge generation and verification
 */

import type { Logger } from '../../types/library.types.ts';
import { toError } from '../utils/Error.ts';

/**
 * PKCE code challenge methods supported
 */
export type PKCEMethod = 'S256' | 'plain';

/**
 * Code challenge generation result
 */
export interface CodeChallengeResult {
  /** Generated code challenge */
  codeChallenge: string;
  /** Method used for challenge generation */
  method: PKCEMethod;
}

/**
 * PKCE validation result
 */
export interface PKCEValidation {
  /** Whether PKCE validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * 🔒 SECURITY-CRITICAL: PKCE Handler for OAuth 2.0
 *
 * Implements Proof Key for Code Exchange (RFC 7636) with exact security preservation
 * from the original OAuthClientService.ts implementation. PKCE prevents authorization
 * code interception attacks by public OAuth clients.
 *
 * Key Security Features:
 * - S256 code challenge method using SHA-256 digest
 * - Base64URL encoding without padding (+/= characters replaced)
 * - Proper code verifier validation (43-128 characters, unreserved character set)
 * - Cryptographically secure challenge generation
 * - RFC 7636 compliant validation logic
 */
export class PKCEHandler {
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
    this.logger?.debug('PKCEHandler: Initialized PKCE handler');
  }

  /**
   * 🔒 SECURITY-CRITICAL: Generate code challenge from code verifier
   *
   * Preserves exact code challenge generation from OAuthClientService.generateCodeChallenge()
   * - S256 method: SHA-256 digest with base64url encoding
   * - Plain method: Direct code verifier use (not recommended)
   * - Base64URL encoding: Replace +/= characters per RFC 7636
   */
  async generateCodeChallenge(codeVerifier: string, method: PKCEMethod = 'S256'): Promise<string> {
    const challengeId = Math.random().toString(36).substring(2, 15);

    this.logger?.debug(`PKCEHandler: Generating code challenge [${challengeId}]`, {
      challengeId,
      method,
      codeVerifierLength: codeVerifier.length,
    });

    try {
      if (method === 'plain') {
        // Plain method: return code verifier as-is (not recommended for security)
        this.logger?.warn(`PKCEHandler: Using plain PKCE method [${challengeId}]`, {
          challengeId,
          message: 'Plain method is less secure than S256',
        });
        return codeVerifier;
      }

      // 🔒 SECURITY-CRITICAL: S256 method implementation (exact preservation from OAuthClientService.ts)
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);

      // Generate SHA-256 digest using Web Crypto API
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);

      // 🔒 SECURITY-CRITICAL: Base64URL encoding (exact preservation)
      // Convert to base64, then replace characters per RFC 7636
      const base64 = btoa(String.fromCharCode(...hashArray));
      const base64url = base64
        .replace(/\+/g, '-') // Replace + with -
        .replace(/\//g, '_') // Replace / with _
        .replace(/=/g, ''); // Remove padding =

      this.logger?.debug(`PKCEHandler: Generated S256 code challenge [${challengeId}]`, {
        challengeId,
        codeVerifierLength: codeVerifier.length,
        challengeLength: base64url.length,
        challengePrefix: base64url.substring(0, 12) + '...',
      });

      return base64url;
    } catch (error) {
      this.logger?.error(
        `PKCEHandler: Failed to generate code challenge [${challengeId}]:`,
        toError(error),
        {
          challengeId,
          method,
          codeVerifierLength: codeVerifier.length,
        },
      );
      throw error;
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Validate code challenge against code verifier
   *
   * Preserves exact PKCE validation logic from OAuthClientService.ts
   * - Generates expected challenge from provided verifier
   * - Compares with stored challenge using constant-time comparison
   * - Supports both S256 and plain methods
   */
  async validateCodeChallenge(
    codeChallenge: string,
    codeVerifier: string,
    method: PKCEMethod,
  ): Promise<PKCEValidation> {
    const validationId = Math.random().toString(36).substring(2, 15);

    this.logger?.debug(`PKCEHandler: Validating PKCE challenge [${validationId}]`, {
      validationId,
      method,
      challengeLength: codeChallenge.length,
      verifierLength: codeVerifier.length,
      challengePrefix: codeChallenge.substring(0, 12) + '...',
    });

    try {
      // Validate code verifier format first
      const verifierValidation = this.validateCodeVerifier(codeVerifier);
      if (!verifierValidation.valid) {
        this.logger?.error(
          `PKCEHandler: Code verifier validation failed [${validationId}]`,
          undefined,
          {
            validationId,
            error: verifierValidation.error,
          },
        );
        return {
          valid: false,
          error: `Invalid code verifier: ${verifierValidation.error}`,
        };
      }

      // Generate expected challenge from the verifier
      const expectedChallenge = await this.generateCodeChallenge(codeVerifier, method);

      // 🔒 SECURITY-CRITICAL: Constant-time comparison to prevent timing attacks
      const challengesMatch = this.constantTimeCompare(codeChallenge, expectedChallenge);

      if (challengesMatch) {
        this.logger?.debug(`PKCEHandler: PKCE validation successful [${validationId}]`, {
          validationId,
          method,
        });
        return { valid: true };
      } else {
        this.logger?.error(
          `PKCEHandler: PKCE validation failed - challenge mismatch [${validationId}]`,
          undefined,
          {
            validationId,
            method,
            providedChallenge: codeChallenge.substring(0, 12) + '...',
            expectedChallenge: expectedChallenge.substring(0, 12) + '...',
          },
        );
        return {
          valid: false,
          error: 'Code challenge verification failed',
        };
      }
    } catch (error) {
      this.logger?.error(`PKCEHandler: PKCE validation error [${validationId}]:`, toError(error), {
        validationId,
        method,
      });
      return {
        valid: false,
        error: 'PKCE validation failed due to internal error',
      };
    }
  }

  /**
   * 🔒 SECURITY-CRITICAL: Validate code verifier format per RFC 7636
   *
   * RFC 7636 requirements:
   * - Length: 43-128 characters
   * - Character set: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~" (unreserved characters)
   * - No other characters allowed
   */
  validateCodeVerifier(codeVerifier: string): PKCEValidation {
    this.logger?.debug('PKCEHandler: Validating code verifier format', {
      length: codeVerifier.length,
    });

    // Check length requirement (RFC 7636: 43-128 characters)
    if (codeVerifier.length < 43) {
      return {
        valid: false,
        error: `Code verifier too short: ${codeVerifier.length} characters (minimum 43)`,
      };
    }

    if (codeVerifier.length > 128) {
      return {
        valid: false,
        error: `Code verifier too long: ${codeVerifier.length} characters (maximum 128)`,
      };
    }

    // Check character set requirement (RFC 7636: unreserved characters only)
    const unreservedRegex = /^[A-Za-z0-9\-._~]+$/;
    if (!unreservedRegex.test(codeVerifier)) {
      return {
        valid: false,
        error: 'Code verifier contains invalid characters (only A-Z, a-z, 0-9, -, ., _, ~ allowed)',
      };
    }

    this.logger?.debug('PKCEHandler: Code verifier format validation successful', {
      length: codeVerifier.length,
    });

    return { valid: true };
  }

  /**
   * Generate cryptographically secure code verifier
   *
   * Creates a random code verifier that meets RFC 7636 requirements:
   * - 64 characters (within 43-128 range)
   * - Uses unreserved character set
   * - Cryptographically secure randomness
   */
  generateCodeVerifier(): string {
    const length = 64; // Good balance: secure but not too long
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    const codeVerifier = Array.from(randomBytes)
      .map((byte) => charset[byte % charset.length])
      .join('');

    this.logger?.debug('PKCEHandler: Generated code verifier', {
      length: codeVerifier.length,
      charset: 'unreserved characters only',
    });

    return codeVerifier;
  }

  /**
   * Generate code verifier and challenge pair
   *
   * Convenience method that generates both verifier and challenge together
   * for OAuth flows that need both values.
   */
  async generateCodePair(method: PKCEMethod = 'S256'): Promise<{
    codeVerifier: string;
    codeChallenge: string;
    method: PKCEMethod;
  }> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier, method);

    this.logger?.debug('PKCEHandler: Generated PKCE code pair', {
      method,
      verifierLength: codeVerifier.length,
      challengeLength: codeChallenge.length,
    });

    return {
      codeVerifier,
      codeChallenge,
      method,
    };
  }

  /**
   * Check if PKCE is required for a client
   *
   * Currently enforces PKCE for all clients (recommended security practice).
   * Can be extended to allow per-client PKCE requirements.
   */
  isPKCERequired(clientId: string): boolean {
    // For security, require PKCE for all clients
    // This can be made configurable in the future if needed
    this.logger?.debug('PKCEHandler: PKCE requirement check', {
      clientId,
      required: true,
      reason: 'PKCE required for all clients (security best practice)',
    });

    return true;
  }

  /**
   * Get supported PKCE code challenge methods
   *
   * Returns the list of supported PKCE methods for OAuth metadata endpoints.
   * Currently supports S256 (recommended) and plain (for compatibility).
   */
  getSupportedMethods(): PKCEMethod[] {
    return ['S256']; // Only S256 for security (plain method removed)
  }

  /**
   * 🔒 SECURITY-CRITICAL: Constant-time string comparison
   *
   * Prevents timing attacks by ensuring comparison time is independent
   * of where the strings differ. Critical for PKCE challenge validation.
   */
  private constantTimeCompare(a: string, b: string): boolean {
    // If lengths differ, still do full comparison to prevent timing leaks
    const length = Math.max(a.length, b.length);

    // Pad shorter string with null characters
    const aPadded = a.padEnd(length, '\0');
    const bPadded = b.padEnd(length, '\0');

    let result = 0;
    for (let i = 0; i < length; i++) {
      result |= aPadded.charCodeAt(i) ^ bPadded.charCodeAt(i);
    }

    // Also check if original lengths were different
    result |= a.length ^ b.length;

    return result === 0;
  }
}
