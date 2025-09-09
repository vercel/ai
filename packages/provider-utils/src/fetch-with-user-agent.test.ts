import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stabilize provider utils version used inside UA string construction
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

import {
  createUserAgentFetch,
  getRuntimeEnvironmentUserAgent,
} from './fetch-with-user-agent';

describe('createUserAgentFetch', () => {
  const originalFetch = globalThis.fetch;

  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('sets header if none was set', async () => {
    const baseFetch = vi.fn().mockResolvedValue('response');
    const wrapped = createUserAgentFetch(baseFetch);

    const init: RequestInit = {
      method: 'POST',
    };

    const input = 'https://api.example.com';
    await wrapped(input as any, init);

    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(baseFetch.mock.calls[0][0]).toBe(input);
    // Should pass through the exact same init object, without mutation
    expect(baseFetch.mock.calls[0][1]).toEqual({
      method: 'POST',
      headers: {
        'user-agent': `ai-sdk/provider-utils/0.0.0-test ${getRuntimeEnvironmentUserAgent()}`,
      },
    });
  });

  it('adds user-agent header', async () => {
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
    expect(baseFetch.mock.calls[0][1]).toEqual({
      method: 'POST',
      headers: {
        'user-agent': `ai-sdk/provider-utils/0.0.0-test ${getRuntimeEnvironmentUserAgent()}`,
        'x-existing': 'ok',
      },
    });
  });

  it('uses existing user-agent header as prefix', async () => {
    const baseFetch = vi.fn().mockResolvedValue('response');
    const wrapped = createUserAgentFetch(baseFetch);

    await wrapped('https://api.example.com', {
      headers: { 'User-Agent': 'existing/1.0' },
    });

    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(baseFetch.mock.calls[0][1]).toEqual({
      headers: {
        'user-agent': `existing/1.0 ai-sdk/provider-utils/0.0.0-test ${getRuntimeEnvironmentUserAgent()}`,
      },
    });
  });
});
