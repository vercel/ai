import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';

vi.mock('./auth/oidc-token-utils');

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

  it('should refresh expired token when available', async () => {
    const { getTokenPayload, isExpired, findProjectInfo, getVercelCliToken, loadToken, saveToken, refreshOidcToken } = await import('./auth/oidc-token-utils');
    
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };
    process.env.VERCEL_OIDC_TOKEN = 'expired-token';

    vi.mocked(getTokenPayload).mockReturnValue({ sub: 'user', name: 'test', exp: 1234567890 });
    vi.mocked(isExpired).mockReturnValue(true);
    vi.mocked(findProjectInfo).mockResolvedValue({ projectId: 'test-project' });
    vi.mocked(getVercelCliToken).mockResolvedValue('cli-token');
    vi.mocked(loadToken).mockResolvedValue(null);
    vi.mocked(refreshOidcToken).mockResolvedValue({ token: 'new-token' });

    const token = await getVercelOidcToken();
    
    expect(token).toBe('new-token');
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('new-token');
    expect(saveToken).toHaveBeenCalledWith({ token: 'new-token' }, 'test-project');
  });

  it('should use cached token when available and not expired', async () => {
    const { getTokenPayload, isExpired, findProjectInfo, loadToken } = await import('./auth/oidc-token-utils');
    
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };
    process.env.VERCEL_OIDC_TOKEN = 'expired-token';

    vi.mocked(getTokenPayload).mockReturnValue({ sub: 'user', name: 'test', exp: 1234567890 });
    vi.mocked(isExpired)
      .mockReturnValueOnce(true)  // for initial token
      .mockReturnValueOnce(false); // for cached token
    vi.mocked(findProjectInfo).mockResolvedValue({ projectId: 'test-project' });
    vi.mocked(loadToken).mockResolvedValue({ token: 'cached-token' });

    const token = await getVercelOidcToken();
    
    expect(token).toBe('cached-token');
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('cached-token');
  });

  it('should fallback to original token when refresh fails', async () => {
    const { getTokenPayload, isExpired, findProjectInfo } = await import('./auth/oidc-token-utils');
    
    (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: {} }),
    };
    process.env.VERCEL_OIDC_TOKEN = 'original-token';

    vi.mocked(getTokenPayload).mockReturnValue({ sub: 'user', name: 'test', exp: 1234567890 });
    vi.mocked(isExpired).mockReturnValue(true);
    vi.mocked(findProjectInfo).mockResolvedValue(null); // no project info available

    const token = await getVercelOidcToken();
    
    expect(token).toBe('original-token');
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
