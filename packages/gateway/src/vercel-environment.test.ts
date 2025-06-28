import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

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
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({
        headers: {
          'x-vercel-oidc-token': 'header-token-value',
        },
      }),
    };

    const token = await getVercelOidcToken();
    expect(token).toBe('header-token-value');
  });

  it('should get token from environment variable when header is not available', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    const token = await getVercelOidcToken();
    expect(token).toBe('env-token-value');
  });

  it('should prioritize header token over environment variable', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({
        headers: {
          'x-vercel-oidc-token': 'header-token-value',
        },
      }),
    };
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    const token = await getVercelOidcToken();
    expect(token).toBe('header-token-value');
  });

  it('should throw GatewayAuthenticationError when no token is available', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };
    process.env.VERCEL_OIDC_TOKEN = undefined;

    await expect(getVercelOidcToken()).rejects.toMatchObject({
      name: 'GatewayAuthenticationError',
      type: 'authentication_error',
      statusCode: 401,
      message: expect.stringContaining('OIDC token not available'),
    });
  });

  it('should handle missing request context gracefully', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = undefined;
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    const token = await getVercelOidcToken();
    expect(token).toBe('env-token-value');
  });

  it('should handle missing get method in request context', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {};
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    const token = await getVercelOidcToken();
    expect(token).toBe('env-token-value');
  });
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
