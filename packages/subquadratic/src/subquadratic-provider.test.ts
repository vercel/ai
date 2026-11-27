import { NoSuchModelError } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSubquadratic } from './subquadratic-provider';
import { VERSION } from './version';

const chatFixture = JSON.parse(
  readFileSync('src/__fixtures__/chat-completion.json', 'utf8'),
);

const decideCall = {
  state: [{ type: 'text' as const, text: 'Refund me.' }],
  questions: {
    refund: { type: 'boolean' as const, instructions: 'Refund request?' },
  },
};

const generateCall = {
  prompt: [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hi' }] },
  ],
};

describe('createSubquadratic', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('creates chat and decision models and rejects other model types', () => {
    const provider = createSubquadratic();
    expect(provider.specificationVersion).toBe('v4');
    expect(provider('subq-savant-1.4')).toMatchObject({
      provider: 'subquadratic.chat',
      modelId: 'subq-savant-1.4',
      supportedUrls: {},
    });
    expect(provider.chatModel('subq-savant-latest').provider).toBe(
      'subquadratic.chat',
    );
    expect(provider.languageModel('subq-savant-1.4').provider).toBe(
      'subquadratic.chat',
    );
    expect(provider.decisionModel('subq-snap-1.2')).toMatchObject({
      provider: 'subquadratic.decision',
      modelId: 'subq-snap-1.2',
    });
    expect(() => provider.embeddingModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('other')).toThrow(NoSuchModelError);
  });

  it.each([true, false])(
    'uses explicit or environment keys and the default decision endpoint (explicit=%s)',
    async explicit => {
      vi.stubEnv('SUBQUADRATIC_API_KEY', 'env-key');
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        Response.json({
          answers: { refund: { type: 'noul', noul: 0.9 } },
        }),
      );
      const result = await createSubquadratic({
        apiKey: explicit ? 'explicit-key' : undefined,
        fetch,
      })
        .decisionModel('subq-snap-latest')
        .doDecide(decideCall);
      expect(result.usage).toBeUndefined();
      expect(result.response?.modelId).toBe('subq-snap-latest');
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.subq.ai/v1/systemone');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(
        `Bearer ${explicit ? 'explicit-key' : 'env-key'}`,
      );
      expect(headers.get('user-agent')).toContain(
        `ai-sdk-subquadratic/${VERSION}`,
      );
      expect(JSON.parse(init?.body as string).model).toBe('subq-snap-latest');
    },
  );

  it('sends chat requests to the default and custom base URLs with headers', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json(chatFixture));

    await createSubquadratic({ apiKey: 'test-key', fetch })(
      'subq-savant-1.4',
    ).doGenerate(generateCall);
    await createSubquadratic({
      apiKey: 'test-key',
      baseURL: 'https://example.com/v1/',
      headers: { 'x-custom': 'value' },
      fetch,
    })('subq-savant-1.4').doGenerate(generateCall);

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.subq.ai/v1/chat/completions',
      'https://example.com/v1/chat/completions',
    ]);
    const headers = new Headers(fetch.mock.calls[1][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('x-custom')).toBe('value');
    expect(headers.get('user-agent')).toContain(
      `ai-sdk-subquadratic/${VERSION}`,
    );
  });

  it('loads credentials lazily and reports a missing key', async () => {
    vi.stubEnv('SUBQUADRATIC_API_KEY', undefined);
    const provider = createSubquadratic();
    await expect(
      provider.decisionModel('subq-snap-1.2').doDecide(decideCall),
    ).rejects.toThrow('SUBQUADRATIC_API_KEY');
    await expect(
      provider('subq-savant-1.4').doGenerate(generateCall),
    ).rejects.toThrow('SUBQUADRATIC_API_KEY');
  });
});
