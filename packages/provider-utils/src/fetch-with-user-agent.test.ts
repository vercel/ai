import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock user-agent utilities before importing the module under test
vi.mock('./user-agent', () => ({
  getUserAgent: vi.fn().mockReturnValue('test-user-agent'),
  canSetUserAgent: vi.fn(),
}));

// Stabilize provider utils version used inside UA string construction
vi.mock('./version', () => ({
  VERSION: 'test-version',
}));

import { createUserAgentFetch } from './fetch-with-user-agent';
import { getUserAgent, canSetUserAgent } from './user-agent';

describe('createUserAgentFetch', () => {
  const originalFetch = globalThis.fetch;

  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleSpy.mockRestore();
  });

  const setCanSetUA = (value: boolean) => {
    (canSetUserAgent as any).mockReturnValue(value);
  };

  const setBuildUA = (ua: string | (() => string)) => {
    if (typeof ua === 'function') {
      (getUserAgent as any).mockImplementation(ua as any);
    } else {
      (getUserAgent as any).mockReturnValue(ua);
    }
  };

  const getCalledInit = (mockFetch: any, callIndex = 0): RequestInit => {
    return mockFetch.mock.calls[callIndex][1] as RequestInit;
  };

  const getCalledHeaders = (mockFetch: any, callIndex = 0): Headers => {
    const calledInit = getCalledInit(mockFetch, callIndex);
    return new Headers((calledInit?.headers ?? {}) as any);
  };

  it('passes through unchanged when user-agent cannot be set', async () => {
    setCanSetUA(false);
    const baseFetch = vi.fn().mockResolvedValue('response');
    const wrapped = createUserAgentFetch(baseFetch);

    const init: RequestInit = {
      method: 'POST',
      headers: { 'X-Existing': 'ok' },
    };

    const input = 'https://api.example.com';
    await wrapped(input as any, init);

    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(baseFetch.mock.calls[0][0]).toBe(input);
    // Should pass through the exact same init object, without mutation
    expect(baseFetch.mock.calls[0][1]).toBe(init);
  });

  it('adds a user-agent header when allowed and not already present', async () => {
    setCanSetUA(true);
    setBuildUA('ua-from-build');
    const baseFetch = vi.fn().mockResolvedValue('response');
    const wrapped = createUserAgentFetch(baseFetch);

    await wrapped('https://api.example.com');

    const headers = getCalledHeaders(baseFetch);
    expect(headers.get('user-agent')).toBe('ua-from-build');
  });

  it('does not override an existing user-agent header', async () => {
    setCanSetUA(true);
    setBuildUA('ua-from-build-ignored');
    const baseFetch = vi.fn().mockResolvedValue('response');
    const wrapped = createUserAgentFetch(baseFetch);

    await wrapped('https://api.example.com', {
      headers: { 'User-Agent': 'existing/1.0' },
    });

    const headers = getCalledHeaders(baseFetch);
    expect(headers.get('user-agent')).toBe('existing/1.0');
    expect(getUserAgent).not.toHaveBeenCalled();
  });

  it('supports extended segments order (ai, provider, provider-utils, gateway, runtime, os, arch, extra)', async () => {
    setCanSetUA(true);

    const actual = await vi.importActual<any>('./user-agent');
    const expectedUA = actual.buildUserAgent({
      aiVersion: '5.0.30',
      providerVersion: '2.0.0',
      providerUtilsVersion: 'test-version',
      gatewayVersion: '1.2.3',
      runtime: 'node',
      runtimeVersion: '22.0.0',
      platform: 'linux',
      arch: 'x64',
      extra: 'myapp/1.0.0',
    });

    (getUserAgent as any).mockReturnValue(expectedUA);

    const baseFetch = vi.fn().mockResolvedValue('response');
    const wrapped = createUserAgentFetch(baseFetch);

    await wrapped('https://api.example.com');

    const headers = getCalledHeaders(baseFetch);
    expect(headers.get('user-agent')).toBe(
      'ai/5.0.30 @ai-sdk/provider/2.0.0 @ai-sdk/provider-utils/test-version @ai-sdk/gateway/1.2.3 node/22.0.0 os/linux arch/x64 myapp/1.0.0',
    );
    // also equals the computed expectedUA
    expect(headers.get('user-agent')).toBe(expectedUA);
  });
});
