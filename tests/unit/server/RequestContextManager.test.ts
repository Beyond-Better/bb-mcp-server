/**
 * Unit Tests for RequestContextManager
 * Tests AsyncLocalStorage context management extracted from ActionStepMCPServer
 */

import { assert, assertEquals, assertExists } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import { assertSpyCalls, spy } from '@std/testing/mock';

// Import components
import { RequestContextManager } from '../../../src/lib/server/RequestContextManager.ts';
import { Logger } from '../../../src/lib/utils/Logger.ts';

// Import types
import type {
  BeyondMcpRequestContext,
  CreateContextData,
} from '../../../src/lib/types/BeyondMcpTypes.ts';

// Test helpers
import { createMockLogger } from '../../utils/test-helpers.ts';

describe('RequestContextManager', () => {
  let contextManager: RequestContextManager;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    contextManager = new RequestContextManager(mockLogger);
  });

  afterEach(() => {
    // Clean up any active contexts
  });

  describe('Context Creation', () => {
    it('should create valid context from data', () => {
      const contextData: CreateContextData = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read', 'write'],
        requestId: 'request-789',
        sessionId: 'session-abc',
        metadata: { test: true },
      };

      const logSpy = spy(mockLogger, 'debug');

      const context = contextManager.createContext(contextData);

      assertEquals(context.authenticatedUserId, 'user-123');
      assertEquals(context.clientId, 'client-456');
      assertEquals(context.scopes, ['read', 'write']);
      assertEquals(context.requestId, 'request-789');
      assertEquals(context.sessionId, 'session-abc');
      assertEquals(context.metadata.test, true);
      assert(typeof context.startTime === 'number');

      assertSpyCalls(logSpy, 1);

      logSpy.restore();
    });

    it('should generate requestId when not provided', () => {
      const contextData: CreateContextData = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
      };

      const context = contextManager.createContext(contextData);

      assertExists(context.requestId);
      assert(context.requestId.length > 0);
      assert(context.requestId !== contextData.requestId);
    });

    it('should apply default values', () => {
      const contextData: CreateContextData = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
      };

      const context = contextManager.createContext(contextData);

      assertEquals(context.scopes, []);
      assertEquals(Object.keys(context.metadata).length, 0);
    });

    it('should validate context during creation', () => {
      const invalidContextData = {
        authenticatedUserId: '',
        clientId: 'client-456',
      } as CreateContextData;

      const logSpy = spy(mockLogger, 'warn');

      try {
        contextManager.createContext(invalidContextData);
        assert(false, 'Should have thrown validation error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'Invalid context data provided');
      }

      assertSpyCalls(logSpy, 1);

      logSpy.restore();
    });
  });

  describe('Context Validation', () => {
    it('should validate complete context', () => {
      const validContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      };

      const isValid = contextManager.validateContext(validContext);
      assertEquals(isValid, true);
    });

    it('should reject context with missing authenticatedUserId', () => {
      const invalidContext = {
        authenticatedUserId: '',
        clientId: 'client-456',
        scopes: ['read'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      } as BeyondMcpRequestContext;

      const logSpy = spy(mockLogger, 'warn');

      const isValid = contextManager.validateContext(invalidContext);
      assertEquals(isValid, false);

      assertSpyCalls(logSpy, 1);

      logSpy.restore();
    });

    it('should reject context with missing clientId', () => {
      const invalidContext = {
        authenticatedUserId: 'user-123',
        clientId: '',
        scopes: ['read'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      } as BeyondMcpRequestContext;

      const isValid = contextManager.validateContext(invalidContext);
      assertEquals(isValid, false);
    });

    it('should reject context with invalid scopes', () => {
      const invalidContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: 'not-an-array' as any,
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      } as BeyondMcpRequestContext;

      const isValid = contextManager.validateContext(invalidContext);
      assertEquals(isValid, false);
    });
  });

  describe('Context Execution', () => {
    it('should execute operation with context (AsyncLocalStorage pattern)', async () => {
      const testContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'async-user',
        clientId: 'async-client',
        scopes: ['read', 'write'],
        requestId: 'async-request',
        startTime: performance.now(),
        metadata: { async: true },
      };

      const result = await contextManager.executeWithAuthContext(testContext, async () => {
        // Inside the async operation, context should be available
        const currentUserId = contextManager.getAuthenticatedUserId();
        const currentClientId = contextManager.getClientId();
        const currentRequestId = contextManager.getRequestId();
        const currentScopes = contextManager.getScopes();

        return {
          userId: currentUserId,
          clientId: currentClientId,
          requestId: currentRequestId,
          scopes: currentScopes,
        };
      });

      assertEquals(result.userId, 'async-user');
      assertEquals(result.clientId, 'async-client');
      assertEquals(result.requestId, 'async-request');
      assertEquals(result.scopes, ['read', 'write']);
    });

    it('should return null when no context is active', () => {
      assertEquals(contextManager.getCurrentContext(), null);
      assertEquals(contextManager.getAuthenticatedUserId(), null);
      assertEquals(contextManager.getClientId(), null);
      assertEquals(contextManager.getRequestId(), null);
      assertEquals(contextManager.getScopes(), []);
    });

    it('should handle nested context execution', async () => {
      const outerContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'outer-user',
        clientId: 'outer-client',
        scopes: ['read'],
        requestId: 'outer-request',
        startTime: performance.now(),
        metadata: { level: 'outer' },
      };

      const innerContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'inner-user',
        clientId: 'inner-client',
        scopes: ['write'],
        requestId: 'inner-request',
        startTime: performance.now(),
        metadata: { level: 'inner' },
      };

      const result = await contextManager.executeWithAuthContext(outerContext, async () => {
        const outerUserId = contextManager.getAuthenticatedUserId();

        const innerResult = await contextManager.executeWithAuthContext(innerContext, async () => {
          return contextManager.getAuthenticatedUserId();
        });

        const restoredUserId = contextManager.getAuthenticatedUserId();

        return { outerUserId, innerResult, restoredUserId };
      });

      assertEquals(result.outerUserId, 'outer-user');
      assertEquals(result.innerResult, 'inner-user');
      assertEquals(result.restoredUserId, 'outer-user');
    });

    it('should handle concurrent contexts independently', async () => {
      const context1: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-1',
        clientId: 'client-1',
        scopes: ['read'],
        requestId: 'request-1',
        startTime: performance.now(),
        metadata: {},
      };

      const context2: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-2',
        clientId: 'client-2',
        scopes: ['write'],
        requestId: 'request-2',
        startTime: performance.now(),
        metadata: {},
      };

      const [result1, result2] = await Promise.all([
        contextManager.executeWithAuthContext(context1, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return contextManager.getAuthenticatedUserId();
        }),
        contextManager.executeWithAuthContext(context2, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return contextManager.getAuthenticatedUserId();
        }),
      ]);

      assertEquals(result1, 'user-1');
      assertEquals(result2, 'user-2');
    });
  });

  describe('Scope Management', () => {
    it('should check for specific scope', async () => {
      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read', 'write', 'admin'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      };

      const result = await contextManager.executeWithAuthContext(context, async () => {
        return {
          hasRead: contextManager.hasScope('read'),
          hasWrite: contextManager.hasScope('write'),
          hasAdmin: contextManager.hasScope('admin'),
          hasInvalid: contextManager.hasScope('invalid'),
        };
      });

      assertEquals(result.hasRead, true);
      assertEquals(result.hasWrite, true);
      assertEquals(result.hasAdmin, true);
      assertEquals(result.hasInvalid, false);
    });

    it('should check for any of multiple scopes', async () => {
      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read', 'write'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      };

      const result = await contextManager.executeWithAuthContext(context, async () => {
        return {
          hasAnyReadWrite: contextManager.hasAnyScope(['read', 'write']),
          hasAnyAdminDelete: contextManager.hasAnyScope(['admin', 'delete']),
          hasAnyRead: contextManager.hasAnyScope(['read']),
          hasAnyInvalid: contextManager.hasAnyScope(['invalid', 'nonexistent']),
        };
      });

      assertEquals(result.hasAnyReadWrite, true);
      assertEquals(result.hasAnyAdminDelete, false);
      assertEquals(result.hasAnyRead, true);
      assertEquals(result.hasAnyInvalid, false);
    });

    it('should check for all required scopes', async () => {
      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read', 'write', 'admin'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      };

      const result = await contextManager.executeWithAuthContext(context, async () => {
        return {
          hasAllReadWrite: contextManager.hasAllScopes(['read', 'write']),
          hasAllReadAdmin: contextManager.hasAllScopes(['read', 'admin']),
          hasAllReadWriteAdmin: contextManager.hasAllScopes(['read', 'write', 'admin']),
          hasAllWithInvalid: contextManager.hasAllScopes(['read', 'invalid']),
        };
      });

      assertEquals(result.hasAllReadWrite, true);
      assertEquals(result.hasAllReadAdmin, true);
      assertEquals(result.hasAllReadWriteAdmin, true);
      assertEquals(result.hasAllWithInvalid, false);
    });

    it('should return empty array when no context', () => {
      assertEquals(contextManager.getScopes(), []);
      assertEquals(contextManager.hasScope('read'), false);
      assertEquals(contextManager.hasAnyScope(['read', 'write']), false);
      assertEquals(contextManager.hasAllScopes(['read']), false);
    });
  });

  describe('Metadata Management', () => {
    it('should update context metadata', async () => {
      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: { initial: true },
      };

      await contextManager.executeWithAuthContext(context, async () => {
        const initialMetadata = contextManager.getContextMetadata();
        assertEquals(initialMetadata.initial, true);

        contextManager.updateContextMetadata({ updated: true, step: 1 });

        const updatedMetadata = contextManager.getContextMetadata();
        assertEquals(updatedMetadata.initial, true);
        assertEquals(updatedMetadata.updated, true);
        assertEquals(updatedMetadata.step, 1);

        contextManager.updateContextMetadata({ step: 2 });

        const finalMetadata = contextManager.getContextMetadata();
        assertEquals(finalMetadata.step, 2);
      });
    });

    it('should handle metadata update without context', () => {
      const logSpy = spy(mockLogger, 'warn');

      contextManager.updateContextMetadata({ test: true });

      assertSpyCalls(logSpy, 1);

      const metadata = contextManager.getContextMetadata();
      assertEquals(Object.keys(metadata).length, 0);

      logSpy.restore();
    });
  });

  describe('Context Duration Tracking', () => {
    it('should calculate context duration', async () => {
      const startTime = performance.now();
      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read'],
        requestId: 'request-789',
        startTime,
        metadata: {},
      };

      await contextManager.executeWithAuthContext(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));

        const duration = contextManager.getContextDuration();
        assertExists(duration);
        assert(duration >= 10);
        assert(duration < 100); // Should be less than 100ms for this test
      });
    });

    it('should return null duration when no context', () => {
      const duration = contextManager.getContextDuration();
      assertEquals(duration, null);
    });
  });

  describe('Context Status and Summary', () => {
    it('should report active context status', async () => {
      assertEquals(contextManager.hasActiveContext(), false);

      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'user-123',
        clientId: 'client-456',
        scopes: ['read'],
        requestId: 'request-789',
        startTime: performance.now(),
        metadata: {},
      };

      await contextManager.executeWithAuthContext(context, async () => {
        assertEquals(contextManager.hasActiveContext(), true);
      });

      assertEquals(contextManager.hasActiveContext(), false);
    });

    it('should provide context summary', async () => {
      // No context
      const noContextSummary = contextManager.getContextSummary();
      assertEquals(noContextSummary.hasContext, false);

      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'summary-user',
        clientId: 'summary-client',
        scopes: ['read', 'write'],
        requestId: 'summary-request',
        startTime: performance.now(),
        metadata: {},
      };

      await contextManager.executeWithAuthContext(context, async () => {
        const summary = contextManager.getContextSummary();

        assertEquals(summary.hasContext, true);
        assertEquals(summary.authenticatedUserId, 'summary-user');
        assertEquals(summary.clientId, 'summary-client');
        assertEquals(summary.requestId, 'summary-request');
        assertEquals(summary.scopes, ['read', 'write']);
        assertExists(summary.duration);
      });
    });

    it('should log current context', async () => {
      const logSpy = spy(mockLogger, 'debug');

      // No context
      contextManager.logCurrentContext('Test message');
      assertSpyCalls(logSpy, 1);

      const context: BeyondMcpRequestContext = {
        authenticatedUserId: 'log-user',
        clientId: 'log-client',
        scopes: ['read'],
        requestId: 'log-request',
        startTime: performance.now(),
        metadata: { test: true },
      };

      await contextManager.executeWithAuthContext(context, async () => {
        contextManager.logCurrentContext('With context');
        // Expect 3 calls: 1 from first logCurrentContext + 1 from executeWithAuthContext + 1 from second logCurrentContext
        assertSpyCalls(logSpy, 3);
      });

      logSpy.restore();
    });
  });

  describe('Temporary Context Override', () => {
    it('should execute with temporary context override', async () => {
      const baseContext: BeyondMcpRequestContext = {
        authenticatedUserId: 'base-user',
        clientId: 'base-client',
        scopes: ['read'],
        requestId: 'base-request',
        startTime: performance.now(),
        metadata: { level: 'base' },
      };

      await contextManager.executeWithAuthContext(baseContext, async () => {
        assertEquals(contextManager.getAuthenticatedUserId(), 'base-user');

        const result = await contextManager.executeWithTemporaryContext(
          {
            authenticatedUserId: 'temp-user',
            scopes: ['write', 'admin'],
            metadata: { level: 'temp' },
          },
          async () => {
            return {
              userId: contextManager.getAuthenticatedUserId(),
              clientId: contextManager.getClientId(),
              scopes: contextManager.getScopes(),
              metadata: contextManager.getContextMetadata(),
            };
          },
        );

        assertEquals(result.userId, 'temp-user');
        assertEquals(result.clientId, 'base-client'); // Should remain from base
        assertEquals(result.scopes, ['write', 'admin']);
        assertEquals(result.metadata.level, 'temp');

        // Base context should be restored
        assertEquals(contextManager.getAuthenticatedUserId(), 'base-user');
        assertEquals(contextManager.getScopes(), ['read']);
      });
    });

    it('should throw error when no base context for temporary override', async () => {
      try {
        await contextManager.executeWithTemporaryContext(
          { authenticatedUserId: 'temp-user' },
          async () => 'test',
        );
        assert(false, 'Should have thrown error');
      } catch (error) {
        assert(error instanceof Error);
        assertEquals(error.message, 'No base context available for temporary override');
      }
    });
  });

  describe('Context from Authentication', () => {
    it('should create context from auth data', () => {
      const authData = {
        userId: 'auth-user',
        clientId: 'auth-client',
        scopes: ['read', 'write'],
        sessionId: 'auth-session',
        requestId: 'auth-request',
        metadata: { auth: true },
      };

      const context = contextManager.createContextFromAuth(authData);

      assertEquals(context.authenticatedUserId, 'auth-user');
      assertEquals(context.clientId, 'auth-client');
      assertEquals(context.scopes, ['read', 'write']);
      assertEquals(context.sessionId, 'auth-session');
      assertEquals(context.requestId, 'auth-request');
      assertEquals(context.metadata.auth, true);
    });

    it('should handle minimal auth data', () => {
      const minimalAuthData = {
        userId: 'minimal-user',
        clientId: 'minimal-client',
      };

      const context = contextManager.createContextFromAuth(minimalAuthData);

      assertEquals(context.authenticatedUserId, 'minimal-user');
      assertEquals(context.clientId, 'minimal-client');
      assertEquals(context.scopes, []);
      assertEquals(Object.keys(context.metadata).length, 0);
      assertExists(context.requestId);
    });
  });
});
