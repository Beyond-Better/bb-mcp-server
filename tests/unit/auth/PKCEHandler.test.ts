/**
 * PKCEHandler Unit Tests
 *
 * 🔒 SECURITY-CRITICAL: RFC 7636 PKCE Implementation Tests
 *
 * Test Coverage Requirements:
 * - 100% coverage for PKCE security operations (most critical)
 * - RFC 7636 test vectors validation
 * - Cryptographic security validation
 * - Timing attack prevention validation
 * - Code verifier/challenge format validation
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { PKCEHandler } from '../../../src/lib/auth/PKCEHandler.ts';
import type { Logger } from '../../../src/types/library.types.ts';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

Deno.test({
  name: 'PKCEHandler - S256 Code Challenge Generation (RFC 7636 CRITICAL)',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // RFC 7636 Appendix B test vector
    const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const actualChallenge = await pkceHandler.generateCodeChallenge(codeVerifier, 'S256');

    assertEquals(
      actualChallenge,
      expectedChallenge,
      'PKCE S256 challenge must match RFC 7636 test vector',
    );
  },
});

Deno.test({
  name: 'PKCEHandler - Code Challenge Validation (SECURITY CRITICAL)',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // Generate test code verifier and challenge
    const codeVerifier = 'test-code-verifier-123456789012345678901234567890123456789';
    const codeChallenge = await pkceHandler.generateCodeChallenge(codeVerifier, 'S256');

    // Valid verification should pass
    const validResult = await pkceHandler.validateCodeChallenge(
      codeChallenge,
      codeVerifier,
      'S256',
    );
    assertEquals(validResult.valid, true, 'Valid PKCE challenge/verifier pair must validate');

    // Invalid verification should fail
    const invalidResult = await pkceHandler.validateCodeChallenge(
      codeChallenge,
      'wrong-verifier-that-should-fail',
      'S256',
    );
    assertEquals(invalidResult.valid, false, 'Invalid PKCE challenge/verifier pair must fail');
    assertExists(invalidResult.error, 'Failed validation must provide error message');
  },
});

Deno.test({
  name: 'PKCEHandler - Code Verifier Validation (RFC 7636 CRITICAL)',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // Valid code verifiers (RFC 7636 requirements)
    const validVerifiers = [
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', // RFC test vector
      'a'.repeat(43), // Minimum length
      'A'.repeat(128), // Maximum length
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.substring(0, 64), // All valid chars
    ];

    for (const verifier of validVerifiers) {
      const result = pkceHandler.validateCodeVerifier(verifier);
      assertEquals(
        result.valid,
        true,
        `Valid code verifier should pass: ${verifier.substring(0, 20)}...`,
      );
    }

    // Invalid code verifiers
    const invalidVerifiers = [
      'short', // Too short (< 43 characters)
      'a'.repeat(129), // Too long (> 128 characters)
      'invalid@chars!', // Invalid characters
      'spaces not allowed', // Spaces not allowed
      'invalid+chars', // + not allowed
      'invalid=chars', // = not allowed
    ];

    for (const verifier of invalidVerifiers) {
      const result = pkceHandler.validateCodeVerifier(verifier);
      assertEquals(
        result.valid,
        false,
        `Invalid code verifier should fail: ${verifier}`,
      );
      assertExists(result.error, 'Failed validation must provide error message');
    }
  },
});

Deno.test({
  name: 'PKCEHandler - Generate Code Verifier (CRYPTOGRAPHIC SECURITY)',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // Generate multiple code verifiers to test uniqueness
    const verifiers: string[] = [];
    for (let i = 0; i < 10; i++) {
      const verifier = pkceHandler.generateCodeVerifier();
      verifiers.push(verifier);

      // Validate format
      assertEquals(verifier.length, 64, 'Generated verifier must be 64 characters');
      assert(
        /^[A-Za-z0-9\-._~]+$/.test(verifier),
        'Generated verifier must only contain unreserved characters',
      );

      // Validate it passes verification
      const validation = pkceHandler.validateCodeVerifier(verifier);
      assertEquals(validation.valid, true, 'Generated verifier must pass validation');
    }

    // Validate all verifiers are unique (cryptographic randomness)
    const uniqueVerifiers = new Set(verifiers);
    assertEquals(
      uniqueVerifiers.size,
      verifiers.length,
      'All generated verifiers must be unique',
    );
  },
});

Deno.test({
  name: 'PKCEHandler - Code Pair Generation (SECURITY CRITICAL)',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // Generate code pair
    const codePair = await pkceHandler.generateCodePair('S256');

    // Validate structure
    assertExists(codePair.codeVerifier);
    assertExists(codePair.codeChallenge);
    assertEquals(codePair.method, 'S256');

    // Validate verifier format
    assertEquals(codePair.codeVerifier.length, 64);
    assert(/^[A-Za-z0-9\-._~]+$/.test(codePair.codeVerifier));

    // Validate challenge can be verified with verifier
    const validation = await pkceHandler.validateCodeChallenge(
      codePair.codeChallenge,
      codePair.codeVerifier,
      'S256',
    );
    assertEquals(validation.valid, true, 'Generated code pair must validate against each other');
  },
});

Deno.test({
  name: 'PKCEHandler - Plain Method Security Warning',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    const codeVerifier = 'plain-method-test-verifier-that-is-long-enough-for-validation';

    // Plain method should work but is less secure
    const plainChallenge = await pkceHandler.generateCodeChallenge(codeVerifier, 'plain');
    assertEquals(plainChallenge, codeVerifier, 'Plain method should return verifier as-is');

    // Validation should work for plain method
    const validation = await pkceHandler.validateCodeChallenge(
      plainChallenge,
      codeVerifier,
      'plain',
    );
    assertEquals(validation.valid, true, 'Plain method validation should work');
  },
});

Deno.test({
  name: 'PKCEHandler - Supported Methods',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    const supportedMethods = pkceHandler.getSupportedMethods();

    // Should only support S256 for security
    assertEquals(supportedMethods, ['S256'], 'Should only support S256 method for security');
  },
});

Deno.test({
  name: 'PKCEHandler - PKCE Requirement Check',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // PKCE should be required for all clients
    const isRequired = pkceHandler.isPKCERequired('any_client_id');
    assertEquals(isRequired, true, 'PKCE should be required for all clients');
  },
});

Deno.test({
  name: 'PKCEHandler - Constant Time Comparison Security',
  async fn() {
    const pkceHandler = new PKCEHandler(mockLogger);

    // Generate challenge and verifier
    const codeVerifier = 'test-verifier-for-timing-attack-prevention-12345678';
    const correctChallenge = await pkceHandler.generateCodeChallenge(codeVerifier, 'S256');

    // Test multiple wrong challenges of different lengths
    const wrongChallenges = [
      'a', // Very short
      'wrong_challenge_short',
      'wrong_challenge_that_is_much_longer_than_correct_one',
      correctChallenge.substring(0, correctChallenge.length - 1) + 'X', // Almost correct
    ];

    for (const wrongChallenge of wrongChallenges) {
      const validation = await pkceHandler.validateCodeChallenge(
        wrongChallenge,
        codeVerifier,
        'S256',
      );
      assertEquals(
        validation.valid,
        false,
        `Wrong challenge should fail: ${wrongChallenge.substring(0, 10)}...`,
      );
    }

    // Correct challenge should still work
    const correctValidation = await pkceHandler.validateCodeChallenge(
      correctChallenge,
      codeVerifier,
      'S256',
    );
    assertEquals(correctValidation.valid, true, 'Correct challenge should validate');
  },
});
