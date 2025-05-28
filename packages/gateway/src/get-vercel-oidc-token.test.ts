import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVercelOidcToken } from './get-vercel-oidc-token';

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

  it('should throw an error when no token is available', async () => {
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };
    process.env.VERCEL_OIDC_TOKEN = undefined;
    await expect(getVercelOidcToken()).rejects.toThrow(
      "The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?",
    );
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
