import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelIdAliasFetch } from './create-model-id-alias-fetch';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('createModelIdAliasFetch', () => {
  it('replaces a matching top-level model ID and preserves request options', async () => {
    const providerResponse = new Response('stream response');
    const customFetch = vi.fn<typeof globalThis.fetch>(
      async () => providerResponse,
    );
    const fetch = createModelIdAliasFetch({
      modelId: 'claude-opus-5-5',
      aliasModelId: 'claude-opus-early-access',
      fetch: customFetch,
    });

    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"model":"claude-opus-5-5","messages":[]}',
      signal: AbortSignal.timeout(1_000),
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', init);

    expect(response).toBe(providerResponse);
    expect(await response.text()).toBe('stream response');
    expect(customFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      {
        ...init,
        body: '{"model":"claude-opus-early-access","messages":[]}',
      },
    );
  });

  it('passes requests without a matching top-level model ID through unchanged', async () => {
    const customFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(),
    );
    const fetch = createModelIdAliasFetch({
      modelId: 'gpt-5',
      aliasModelId: 'gpt-5-early-access',
      fetch: customFetch,
    });
    const init = {
      method: 'POST',
      body: '{"model":"gpt-5-mini","nested":{"model":"gpt-5"}}',
    };

    await fetch('https://api.openai.com/v1/responses', init);

    expect(customFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      init,
    );
  });

  it('uses the global fetch when no custom fetch is provided', async () => {
    const globalFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(),
    );
    globalThis.fetch = globalFetch;

    const fetch = createModelIdAliasFetch({
      modelId: 'gpt-5',
      aliasModelId: 'gpt-5-early-access',
    });

    await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: '{"model":"gpt-5"}',
    });

    expect(globalFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ body: '{"model":"gpt-5-early-access"}' }),
    );
  });
});
