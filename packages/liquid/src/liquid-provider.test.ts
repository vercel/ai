import { NoSuchModelError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiquid } from './liquid-provider';
import { VERSION } from './version';

const call = {
  state: [{ type: 'text' as const, text: 'Refund me.' }],
  questions: {
    refund: { type: 'boolean' as const, instructions: 'Refund request?' },
  },
};

describe('createLiquid', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects unsupported model types', () => {
    const provider = createLiquid();
    expect(provider.specificationVersion).toBe('v4');
    expect(() => provider.languageModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('other')).toThrow(NoSuchModelError);
  });

  it.each([true, false])(
    'uses explicit or environment keys and the default endpoint (explicit=%s)',
    async explicit => {
      vi.stubEnv('LIQUID_API_KEY', 'env-key');
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        Response.json({
          answers: { refund: { type: 'noul', noul: 0.9 } },
        }),
      );
      const result = await createLiquid({
        apiKey: explicit ? 'explicit-key' : undefined,
        fetch,
      })
        .decisionModel('d1.2-ultra')
        .doDecide(call);
      expect(result.usage).toBeUndefined();
      expect(result.response?.modelId).toBe('d1.2-ultra');
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.liquid.ai/decisions/v1/systemone');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(
        `Bearer ${explicit ? 'explicit-key' : 'env-key'}`,
      );
      expect(headers.get('user-agent')).toContain(`ai-sdk-liquid/${VERSION}`);
      expect(JSON.parse(init?.body as string).model).toBe('d1.2-ultra');
    },
  );

  it('loads credentials lazily and reports a missing key', async () => {
    vi.stubEnv('LIQUID_API_KEY', undefined);
    const model = createLiquid().decisionModel('d1.2');
    await expect(model.doDecide(call)).rejects.toThrow('LIQUID_API_KEY');
  });
});
