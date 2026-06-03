import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

import {
  createOpenAIHeaderProvider,
  createAnthropicHeaderProvider,
} from './azure-ai-foundry-auth';

/**
 * Flush microtask queue so that fire-and-forget
 * `tokenProvider().then(...)` callbacks have executed.
 */
const flushPromises = () =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

describe('createOpenAIHeaderProvider', () => {
  it('returns api-key header when apiKey is provided', () => {
    const getHeaders = createOpenAIHeaderProvider({
      apiKey: 'test-api-key',
    });

    const headers = getHeaders();

    expect(headers['api-key']).toBe('test-api-key');
  });

  it('returns Authorization Bearer header after token cache is warmed', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('test-token');

    const getHeaders = createOpenAIHeaderProvider({ tokenProvider });

    // Wait for the background cache-warming promise to settle
    await flushPromises();

    const headers = getHeaders();

    expect(headers['authorization']).toBe('Bearer test-token');
    // api-key should not be present when token is cached
    expect(headers['api-key']).toBeUndefined();
  });

  it('token provider takes precedence over apiKey after cache warming', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('my-token');

    const getHeaders = createOpenAIHeaderProvider({
      apiKey: 'my-api-key',
      tokenProvider,
    });

    await flushPromises();

    const headers = getHeaders();

    expect(headers['authorization']).toBe('Bearer my-token');
    expect(headers['api-key']).toBeUndefined();
  });

  it('falls back to apiKey before token cache is populated', () => {
    // Token provider returns a promise that never resolves during this test
    const tokenProvider = vi
      .fn()
      .mockReturnValue(new Promise<string>(() => {}));

    const getHeaders = createOpenAIHeaderProvider({
      apiKey: 'fallback-key',
      tokenProvider,
    });

    // Call immediately — cache is not yet populated
    const headers = getHeaders();

    expect(headers['api-key']).toBe('fallback-key');
    expect(headers['authorization']).toBeUndefined();
  });

  it('does not throw on tokenProvider rejection (fire-and-forget)', async () => {
    const tokenProvider = vi
      .fn()
      .mockRejectedValue(new Error('token fetch failed'));

    const getHeaders = createOpenAIHeaderProvider({
      apiKey: 'fallback-key',
      tokenProvider,
    });

    // Wait for the cache-warming promise (which rejects) to settle
    await flushPromises();

    // Should fall back to API key without crashing
    const headers = getHeaders();
    expect(headers['api-key']).toBe('fallback-key');
    expect(headers['authorization']).toBeUndefined();
  });

  it('throws when neither apiKey nor tokenProvider is provided and AZURE_API_KEY is unset', () => {
    const saved = process.env.AZURE_API_KEY;
    delete process.env.AZURE_API_KEY;

    try {
      const getHeaders = createOpenAIHeaderProvider({});
      expect(() => getHeaders()).toThrow(/Azure AI Foundry/);
    } finally {
      if (saved !== undefined) {
        process.env.AZURE_API_KEY = saved;
      }
    }
  });

  it('merges custom headers from settings', () => {
    const getHeaders = createOpenAIHeaderProvider({
      apiKey: 'key',
      headers: { 'x-custom': 'custom-value' },
    });

    const headers = getHeaders();

    expect(headers['x-custom']).toBe('custom-value');
    expect(headers['api-key']).toBe('key');
  });

  it('includes user-agent suffix with package version', () => {
    const getHeaders = createOpenAIHeaderProvider({
      apiKey: 'key',
    });

    const headers = getHeaders();

    expect(headers['user-agent']).toContain(
      'ai-sdk/azure-ai-foundry/0.0.0-test',
    );
  });

  it('triggers background token refresh on each invocation', async () => {
    let callCount = 0;
    const tokenProvider = vi.fn().mockImplementation(async () => {
      callCount++;
      return `token-${callCount}`;
    });

    const getHeaders = createOpenAIHeaderProvider({ tokenProvider });

    // Wait for initial cache warming
    await flushPromises();

    // First call triggers a background refresh
    const headers1 = getHeaders();
    expect(headers1['authorization']).toMatch(/^Bearer token-/);

    // Wait for the background refresh triggered by the first call
    await flushPromises();

    const headers2 = getHeaders();
    // Token should have been refreshed
    expect(headers2['authorization']).toMatch(/^Bearer token-/);

    // tokenProvider called: once for warming + once per getHeaders call (2 calls)
    expect(tokenProvider).toHaveBeenCalledTimes(3);
  });
});

describe('createAnthropicHeaderProvider', () => {
  it('returns x-api-key header when apiKey is provided', async () => {
    const getHeaders = createAnthropicHeaderProvider({
      apiKey: 'test-api-key',
    });

    const headers = await getHeaders();

    expect(headers['x-api-key']).toBe('test-api-key');
  });

  it('includes default anthropic-version header', async () => {
    const getHeaders = createAnthropicHeaderProvider({
      apiKey: 'key',
    });

    const headers = await getHeaders();

    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('uses custom anthropicVersion when provided', async () => {
    const getHeaders = createAnthropicHeaderProvider({
      apiKey: 'key',
      anthropicVersion: '2024-10-22',
    });

    const headers = await getHeaders();

    expect(headers['anthropic-version']).toBe('2024-10-22');
  });

  it('returns Authorization Bearer header when tokenProvider is given', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('anthro-token');

    const getHeaders = createAnthropicHeaderProvider({ tokenProvider });

    const headers = await getHeaders();

    expect(headers['authorization']).toBe('Bearer anthro-token');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('token provider takes precedence over apiKey', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('priority-token');

    const getHeaders = createAnthropicHeaderProvider({
      apiKey: 'fallback-key',
      tokenProvider,
    });

    const headers = await getHeaders();

    expect(headers['authorization']).toBe('Bearer priority-token');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('throws when neither apiKey nor tokenProvider is provided and AZURE_API_KEY is unset', async () => {
    const saved = process.env.AZURE_API_KEY;
    delete process.env.AZURE_API_KEY;

    try {
      const getHeaders = createAnthropicHeaderProvider({});
      await expect(getHeaders()).rejects.toThrow(/Azure AI Foundry Anthropic/);
    } finally {
      if (saved !== undefined) {
        process.env.AZURE_API_KEY = saved;
      }
    }
  });

  it('merges custom headers from settings', async () => {
    const getHeaders = createAnthropicHeaderProvider({
      apiKey: 'key',
      headers: { 'x-custom': 'custom-value' },
    });

    const headers = await getHeaders();

    expect(headers['x-custom']).toBe('custom-value');
    expect(headers['x-api-key']).toBe('key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('includes user-agent suffix with package version', async () => {
    const getHeaders = createAnthropicHeaderProvider({
      apiKey: 'key',
    });

    const headers = await getHeaders();

    expect(headers['user-agent']).toContain(
      'ai-sdk/azure-ai-foundry/0.0.0-test',
    );
  });
});
