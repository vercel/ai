import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

function setRequestContext(context: any) {
  (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = context;
}

// TODO: this key will expire in 2033 :)
const OIDC_TEST_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29pZGMudmVyY2VsLmNvbS92ZXJjZWwiLCJzdWIiOiJvd25lcjp2ZXJjZWw6cHJvamVjdDphaTplbnZpcm9ubWVudDpkZXZlbG9wbWVudCIsInNjb3BlIjoib3duZXI6dmVyY2VsOnByb2plY3Q6YWk6ZGV2ZWxvcG1lbnQiLCJhdWQiOiJodHRwczovL3ZlcmNlbC5jb20vdmVyY2VsIiwib3duZXIiOiJ2ZXJjZWwiLCJvd25lcl9pZCI6InRlYW1fdmVyY2VsIiwicHJvamVjdCI6ImFpIiwicHJvamVjdF9pZCI6InByal9haSIsImVudmlyb25tZW50IjoiZGV2ZWxvcG1lbnQiLCJ1c2VyX2lkIjoiIiwibmJmIjoxNzU4OTQ3MDIyLCJpYXQiOjE3NTg5NDcwMjIsImV4cCI6MTc1ODk5MDIyMn0.AMn9eEYoRKARWiv2oI8SjkP32JwQkC9fiW3nCJ6-OlY';

describe('getVercelOidcToken', () => {
  const originalEnv = process.env;
  const originalSymbolValue = (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];

  beforeEach(() => {
    process.env = { ...originalEnv };
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalSymbolValue) {
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = originalSymbolValue;
    } else {
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = undefined;
    }
  });

  it('should get token from request headers', async () => {
    setRequestContext({
      get: () => ({
        headers: {
          'x-vercel-oidc-token': OIDC_TEST_TOKEN,
        },
      }),
    });

    const token = await getVercelOidcToken();
    expect(token).toBe(OIDC_TEST_TOKEN);
  });

  it('should get token from environment variable when header is not available', async () => {
    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = OIDC_TEST_TOKEN;

    const token = await getVercelOidcToken();
    expect(token).toBe(OIDC_TEST_TOKEN);
  });

  it('should prioritize header token over environment variable', async () => {
    setRequestContext({
      get: () => ({
        headers: {
          'x-vercel-oidc-token': OIDC_TEST_TOKEN,
        },
      }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'not-my-OIDC-token';

    const token = await getVercelOidcToken();
    expect(token).toBe(OIDC_TEST_TOKEN);
  });

  it('should handle missing request context gracefully', async () => {
    setRequestContext(undefined);
    process.env.VERCEL_OIDC_TOKEN = OIDC_TEST_TOKEN;

    const token = await getVercelOidcToken();
    expect(token).toBe(OIDC_TEST_TOKEN);
  });

  it('should handle missing get method in request context', async () => {
    setRequestContext({});
    process.env.VERCEL_OIDC_TOKEN = OIDC_TEST_TOKEN;

    const token = await getVercelOidcToken();
    expect(token).toBe(OIDC_TEST_TOKEN);
  });

  // TODO: refresh token testing
  it.todo(
    'should throw GatewayAuthenticationError when no token is available',
    async () => {
      setRequestContext({
        get: () => ({ headers: {} }),
      });
      process.env.VERCEL_OIDC_TOKEN = undefined;

      await expect(getVercelOidcToken()).rejects.toMatchObject({
        name: 'GatewayAuthenticationError',
        type: 'authentication_error',
        statusCode: 401,
        message: expect.stringContaining('OIDC token not available'),
      });
    },
  );
});

describe('getVercelRequestId', () => {
  const originalSymbolValue = (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];

  beforeEach(() => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = undefined;
  });

  afterEach(() => {
    if (originalSymbolValue) {
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = originalSymbolValue;
    } else {
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = undefined;
    }
  });

  it('should get request ID from request headers when available', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({
        headers: {
          'x-vercel-id': 'req_1234567890abcdef',
        },
      }),
    };

    const requestId = await getVercelRequestId();
    expect(requestId).toBe('req_1234567890abcdef');
  });

  it('should return undefined when request ID header is not available', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });

  it('should return undefined when no headers are available', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({}),
    };

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });

  it('should handle missing request context gracefully', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = undefined;

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });

  it('should handle missing get method in request context', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {};

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });
});
