import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZaiChatLanguageModel } from './zai-chat-language-model';
import { createZai } from './zai-provider';
import { VERSION } from './version';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

function createFetchMock() {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'chatcmpl-1',
        created: 1,
        model: 'glm-5.3',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createZai', () => {
  it('creates callable, languageModel, and chat models', () => {
    const provider = createZai({ apiKey: 'test-key' });

    expect(provider.specificationVersion).toBe('v4');
    expect(provider('glm-5.3')).toBeInstanceOf(ZaiChatLanguageModel);
    expect(provider.languageModel('glm-5.3')).toBeInstanceOf(
      ZaiChatLanguageModel,
    );
    expect(provider.chat('glm-5.3')).toBeInstanceOf(ZaiChatLanguageModel);
  });

  it('uses the default endpoint, bearer authentication, and user agent', async () => {
    const fetch = createFetchMock();
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    await model.doGenerate({ prompt: TEST_PROMPT });

    expect(String(fetch.mock.calls[0][0])).toBe(
      'https://api.z.ai/api/paas/v4/chat/completions',
    );
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('user-agent')).toContain(`ai-sdk/zai/${VERSION}`);
  });

  it('reads the API key from ZAI_API_KEY by default', async () => {
    vi.stubEnv('ZAI_API_KEY', 'environment-key');
    const fetch = createFetchMock();
    const model = createZai({ fetch })('glm-5.3');

    await model.doGenerate({ prompt: TEST_PROMPT });

    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get('authorization')).toBe('Bearer environment-key');
  });

  it('uses custom settings and removes a trailing slash from baseURL', async () => {
    const fetch = createFetchMock();
    const model = createZai({
      apiKey: 'custom-key',
      baseURL: 'https://example.com/zai/',
      headers: { 'x-custom': 'value' },
      fetch,
    })('glm-5.3');

    await model.doGenerate({ prompt: TEST_PROMPT });

    expect(String(fetch.mock.calls[0][0])).toBe(
      'https://example.com/zai/chat/completions',
    );
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get('authorization')).toBe('Bearer custom-key');
    expect(headers.get('x-custom')).toBe('value');
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    const provider = createZai({ apiKey: 'test-key' });

    expect(() => provider.embeddingModel('model')).toThrow(
      'No such embeddingModel: model',
    );
    expect(() => provider.imageModel('model')).toThrow(
      'No such imageModel: model',
    );
  });
});
