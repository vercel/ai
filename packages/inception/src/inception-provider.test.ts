import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInception, inception } from './inception-provider';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];
const response = {
  choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
};

describe('createInception', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('provides the default instance and chat aliases', () => {
    expect(inception.specificationVersion).toBe('v4');
    for (const model of [
      inception('mercury-3'),
      inception.chat('mercury-3'),
      inception.languageModel('mercury-3'),
    ]) {
      expect(model.modelId).toBe('mercury-3');
      expect(model.provider).toBe('inception.chat');
      expect(model.specificationVersion).toBe('v4');
    }
  });

  it('uses the environment API key and default endpoint', async () => {
    vi.stubEnv('INCEPTION_API_KEY', 'env-key');
    const fetch = vi.fn(async () => Response.json(response));
    await createInception({ fetch })('mercury-3').doGenerate({ prompt });
    expect(fetch.mock.calls[0]).toMatchObject([
      'https://api.inceptionlabs.ai/v1/chat/completions',
      {
        headers: expect.objectContaining({
          authorization: 'Bearer env-key',
          'user-agent': expect.stringContaining('ai-sdk-inception/'),
        }),
      },
    ]);
  });

  it('supports custom endpoints, headers, fetch and rotating credentials', async () => {
    const fetch = vi.fn(async () => Response.json(response));
    let key = 'first-key';
    const model = createInception({
      apiKey: async () => key,
      baseURL: 'https://example.com/v1/',
      headers: { 'custom-header': 'value' },
      fetch,
    })('custom-model');
    await model.doGenerate({ prompt, headers: { 'request-header': 'value' } });
    key = 'second-key';
    await model.doGenerate({ prompt });
    expect(fetch.mock.calls[0]).toMatchObject([
      'https://example.com/v1/chat/completions',
      {
        headers: expect.objectContaining({
          authorization: 'Bearer first-key',
          'custom-header': 'value',
          'request-header': 'value',
        }),
      },
    ]);
    expect(fetch.mock.calls[1]).toMatchObject([
      'https://example.com/v1/chat/completions',
      {
        headers: expect.objectContaining({
          authorization: 'Bearer second-key',
        }),
      },
    ]);
  });

  it('rejects unsupported model types', () => {
    expect(() => inception.embeddingModel('model')).toThrow(/embeddingModel/);
    expect(() => inception.imageModel('model')).toThrow(/imageModel/);
  });
});
