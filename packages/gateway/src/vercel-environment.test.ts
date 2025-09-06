import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getVercelOidcToken, getVercelRequestId } from './vercel-environment';

vi.mock('./auth/oidc-token-utils');

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

interface VercelRequestContext {
  get: () => {
    headers?: Record<string, string>;
  };
}

function setRequestContext(context: VercelRequestContext | undefined) {
  (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = context;
}

function getRequestContext(): VercelRequestContext | undefined {
  return (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
}

describe('getVercelOidcToken', () => {
  const originalEnv = process.env;
  const originalSymbolValue = getRequestContext();

  beforeEach(() => {
    process.env = { ...originalEnv };
    setRequestContext(undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    setRequestContext(originalSymbolValue);
  });

  it('should get token from request headers', async () => {
    setRequestContext({
      get: () => ({
        headers: {
          'x-vercel-oidc-token': 'header-token-value',
        },
      }),
    });

    const token = await getVercelOidcToken();
    expect(token).toBe('header-token-value');
  });

  it('should get token from environment variable when header is not available', async () => {
    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    const token = await getVercelOidcToken();
    expect(token).toBe('env-token-value');
  });

  it('should prioritize header token over environment variable', async () => {
    setRequestContext({
      get: () => ({
        headers: {
          'x-vercel-oidc-token': 'header-token-value',
        },
      }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    const token = await getVercelOidcToken();
    expect(token).toBe('header-token-value');
  });

  it('should throw GatewayAuthenticationError when no token is available', async () => {
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
  });

  it('should refresh expired token when available', async () => {
    const { getTokenPayload, isExpired, tryRefreshOidcToken } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'expired-token';

    vi.mocked(getTokenPayload).mockReturnValue({
      sub: 'user',
      name: 'test',
      exp: 1234567890,
    });
    vi.mocked(isExpired).mockReturnValue(true);
    vi.mocked(tryRefreshOidcToken).mockResolvedValue('new-token');

    const token = await getVercelOidcToken();

    expect(token).toBe('new-token');
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('new-token');
  });

  it('should throw error when expired token refresh fails', async () => {
    const { getTokenPayload, isExpired, tryRefreshOidcToken } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'expired-token';

    vi.mocked(getTokenPayload).mockReturnValue({
      sub: 'user',
      name: 'test',
      exp: 1234567890,
    });
    vi.mocked(isExpired).mockReturnValue(true);
    vi.mocked(tryRefreshOidcToken).mockResolvedValue(null); // refresh fails

    await expect(getVercelOidcToken()).rejects.toMatchObject({
      name: 'GatewayAuthenticationError',
      type: 'authentication_error',
      statusCode: 401,
      message: expect.stringContaining('expired and automatic refresh failed'),
    });
  });

  it('should handle missing request context gracefully', async () => {
    const { getTokenPayload, isExpired } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext(undefined);
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    vi.mocked(getTokenPayload).mockReturnValue({
      sub: 'user',
      name: 'test',
      exp: Math.floor(Date.now() / 1000) + 3600, // valid token
    });
    vi.mocked(isExpired).mockReturnValue(false);

    const token = await getVercelOidcToken();
    expect(token).toBe('env-token-value');
  });

  it('should handle missing get method in request context', async () => {
    const { getTokenPayload, isExpired } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({} as VercelRequestContext); // intentionally malformed
    process.env.VERCEL_OIDC_TOKEN = 'env-token-value';

    vi.mocked(getTokenPayload).mockReturnValue({
      sub: 'user',
      name: 'test',
      exp: Math.floor(Date.now() / 1000) + 3600, // valid token
    });
    vi.mocked(isExpired).mockReturnValue(false);

    const token = await getVercelOidcToken();
    expect(token).toBe('env-token-value');
  });

  it('should attempt refresh when token parsing fails', async () => {
    const { getTokenPayload, tryRefreshOidcToken } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'malformed-token';

    vi.mocked(getTokenPayload).mockImplementation(() => {
      throw new Error('Invalid token');
    });
    vi.mocked(tryRefreshOidcToken).mockResolvedValue('new-token');

    const token = await getVercelOidcToken();

    expect(token).toBe('new-token');
    expect(process.env.VERCEL_OIDC_TOKEN).toBe('new-token');
  });

  it('should throw error when malformed token refresh fails', async () => {
    const { getTokenPayload, tryRefreshOidcToken } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'malformed-token';

    vi.mocked(getTokenPayload).mockImplementation(() => {
      throw new Error('Invalid token');
    });
    vi.mocked(tryRefreshOidcToken).mockResolvedValue(null);

    await expect(getVercelOidcToken()).rejects.toMatchObject({
      name: 'GatewayAuthenticationError',
      type: 'authentication_error',
      statusCode: 401,
      message: expect.stringContaining(
        'malformed and automatic refresh failed',
      ),
    });
  });

  it('should not call refresh when token is valid', async () => {
    const { getTokenPayload, isExpired, tryRefreshOidcToken } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'valid-token';

    vi.mocked(getTokenPayload).mockReturnValue({
      sub: 'user',
      name: 'test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.mocked(isExpired).mockReturnValue(false);

    const token = await getVercelOidcToken();

    expect(token).toBe('valid-token');
    expect(tryRefreshOidcToken).not.toHaveBeenCalled();
  });

  it('should deduplicate concurrent refresh attempts', async () => {
    const { getTokenPayload, isExpired, tryRefreshOidcToken } = await import(
      './auth/oidc-token-utils'
    );

    setRequestContext({
      get: () => ({ headers: {} }),
    });
    process.env.VERCEL_OIDC_TOKEN = 'expired-token';

    vi.mocked(getTokenPayload).mockReturnValue({
      sub: 'user',
      name: 'test',
      exp: 1234567890,
    });
    vi.mocked(isExpired).mockReturnValue(true);

    let resolveRefresh: (value: string) => void;
    const refreshPromise = new Promise<string>(resolve => {
      resolveRefresh = resolve;
    });
    vi.mocked(tryRefreshOidcToken).mockReturnValue(refreshPromise);

    const call1 = getVercelOidcToken();
    const call2 = getVercelOidcToken();
    const call3 = getVercelOidcToken();

    resolveRefresh!('new-token');

    const [token1, token2, token3] = await Promise.all([call1, call2, call3]);

    expect(token1).toBe('new-token');
    expect(token2).toBe('new-token');
    expect(token3).toBe('new-token');

    expect(tryRefreshOidcToken).toHaveBeenCalledTimes(1);
  });
});

describe('getVercelRequestId', () => {
  const originalSymbolValue = getRequestContext();

  beforeEach(() => {
    setRequestContext(undefined);
  });

  afterEach(() => {
    setRequestContext(originalSymbolValue);
  });

  it('should get request ID from request headers when available', async () => {
    setRequestContext({
      get: () => ({
        headers: {
          'x-vercel-id': 'req_1234567890abcdef',
        },
      }),
    });

    const requestId = await getVercelRequestId();
    expect(requestId).toBe('req_1234567890abcdef');
  });

  it('should return undefined when request ID header is not available', async () => {
    setRequestContext({
      get: () => ({ headers: {} }),
    });

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });

  it('should return undefined when no headers are available', async () => {
    setRequestContext({
      get: () => ({}),
    });

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });

  it('should handle missing request context gracefully', async () => {
    setRequestContext(undefined);

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });

  it('should handle missing get method in request context', async () => {
    setRequestContext({} as VercelRequestContext);

    const requestId = await getVercelRequestId();
    expect(requestId).toBeUndefined();
  });
});
