import { NoSuchModelError } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHume } from './hume-provider';
import { VERSION } from './version';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);

const call = {
  state: [
    {
      type: 'file' as const,
      mediaType: 'audio/mpeg',
      data: { type: 'data' as const, data: 'SUQzBA==' },
    },
  ],
  questions: {
    science: {
      type: 'boolean' as const,
      instructions: 'Does the speaker talk about science?',
    },
  },
};

describe('createHume', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects unsupported model types', () => {
    const provider = createHume();
    expect(provider.specificationVersion).toBe('v4');
    expect(() => provider.languageModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('other')).toThrow(NoSuchModelError);
  });

  it.each([true, false])(
    'uses explicit or environment keys and the default endpoint (explicit=%s)',
    async explicit => {
      vi.stubEnv('HUME_API_KEY', 'env-key');
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          Response.json({ answers: { science: fixture.answers.science } }),
        );
      const result = await createHume({
        apiKey: explicit ? 'explicit-key' : undefined,
        fetch,
      })
        .decisionModel('audio-decisions')
        .doDecide(call);
      expect(result.response?.modelId).toBe('audio-decisions');
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.cloud.hume.ai/v0/decisions/file');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-hume-api-key')).toBe(
        explicit ? 'explicit-key' : 'env-key',
      );
      expect(headers.get('user-agent')).toContain(`ai-sdk-hume/${VERSION}`);
    },
  );

  it('loads credentials lazily and reports a missing key', async () => {
    vi.stubEnv('HUME_API_KEY', undefined);
    const model = createHume().decisionModel('audio-decisions');
    await expect(model.doDecide(call)).rejects.toThrow('HUME_API_KEY');
  });
});
