import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LoadAPIKeyError,
  NoSuchModelError,
  type Experimental_VideoModelV4 as VideoModelV4,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TencentChatLanguageModel } from './tencent-chat-language-model';
import { createTencent } from './tencent-provider';
import { TencentVideoModel } from './tencent-video-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hi' }] },
];

const videoOptions = {
  prompt: 'A cat',
  n: 1,
  image: undefined,
  frameImages: undefined,
  inputReferences: undefined,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  generateAudio: undefined,
  providerOptions: {},
} as const;

function startVideo(model: VideoModelV4) {
  if (model.doStart == null) {
    throw new Error('expected an async video model');
  }
  return model.doStart(videoOptions);
}

describe('createTencent', () => {
  const server = createTestServer({
    'https://tokenhub-intl.tencentcloudmaas.com/v1/chat/completions': {
      response: {
        type: 'json-value',
        body: {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 1794120000,
          model: 'hy4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        },
      },
    },
    'https://custom.example.com/v1/chat/completions': {
      response: {
        type: 'json-value',
        body: {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 1794120000,
          model: 'hy4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
        },
      },
    },
    'https://vod.intl.tencentcloudapi.com/': {
      response: {
        type: 'json-value',
        body: { Response: { TaskId: 'task-1', RequestId: 'req-1' } },
      },
    },
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('language models', () => {
    it('creates TokenHub chat models', () => {
      const provider = createTencent({ apiKey: 'test-key' });
      const model = provider('hy4');

      expect(model).toBeInstanceOf(TencentChatLanguageModel);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(model.provider).toBe('tencent.chat');
      expect(model.modelId).toBe('hy4');
      expect(provider.chat('hy3')).toBeInstanceOf(TencentChatLanguageModel);
      expect(provider.languageModel('hy3')).toBeInstanceOf(
        TencentChatLanguageModel,
      );
    });

    it('calls TokenHub chat completions with the API key and usage', async () => {
      const model = createTencent({ apiKey: 'test-key' })('hy4');

      const result = await model.doGenerate({
        prompt,
        providerOptions: {
          tencent: { reasoningEffort: 'high', thinking: { type: 'enabled' } },
        },
      });

      const call = server.calls[0];
      expect(call.requestHeaders.authorization).toBe('Bearer test-key');
      expect(call.requestUserAgent).toContain('ai-sdk-tencent/0.0.0-test');
      expect(await call.requestBodyJson).toStrictEqual({
        model: 'hy4',
        messages: [{ role: 'user', content: 'Hi' }],
        reasoning_effort: 'high',
        thinking: { type: 'enabled' },
      });
      expect(result.content).toStrictEqual([{ type: 'text', text: 'Hello' }]);
      expect(result.usage.inputTokens.total).toBe(3);
    });

    it('reads the API key from TENCENT_TOKENHUB_API_KEY', async () => {
      vi.stubEnv('TENCENT_TOKENHUB_API_KEY', 'env-key');

      await createTencent()('hy4').doGenerate({ prompt });

      expect(server.calls[0].requestHeaders.authorization).toBe(
        'Bearer env-key',
      );
    });

    it('throws when the API key is missing', async () => {
      vi.stubEnv('TENCENT_TOKENHUB_API_KEY', undefined);

      await expect(
        createTencent()('hy4').doGenerate({ prompt }),
      ).rejects.toBeInstanceOf(LoadAPIKeyError);
    });

    it('keeps the TokenHub endpoint after workflow serialization', async () => {
      const model = createTencent({ apiKey: 'test-key' })(
        'hy4',
      ) as TencentChatLanguageModel;
      const restored = TencentChatLanguageModel[WORKFLOW_DESERIALIZE](
        JSON.parse(
          JSON.stringify(TencentChatLanguageModel[WORKFLOW_SERIALIZE](model)),
        ),
      );

      const result = await restored.doGenerate({ prompt });

      expect(restored).toBeInstanceOf(TencentChatLanguageModel);
      expect(restored.provider).toBe('tencent.chat');
      expect(server.calls[0].requestUrl).toBe(
        'https://tokenhub-intl.tencentcloudmaas.com/v1/chat/completions',
      );
      expect(server.calls[0].requestHeaders.authorization).toBe(
        'Bearer test-key',
      );
      expect(result.content).toStrictEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('respects a custom baseURL and headers', async () => {
      await createTencent({
        apiKey: 'test-key',
        baseURL: 'https://custom.example.com/v1/',
        headers: { 'x-custom': 'value' },
      })('hy4').doGenerate({ prompt });

      expect(server.calls[0].requestUrl).toBe(
        'https://custom.example.com/v1/chat/completions',
      );
      expect(server.calls[0].requestHeaders['x-custom']).toBe('value');
    });
  });

  describe('video models', () => {
    it('creates video models', () => {
      const provider = createTencent();

      expect(provider.video('kling-video-v3')).toBeInstanceOf(
        TencentVideoModel,
      );
      expect(provider.videoModel('vod/VS/2.0')).toBeInstanceOf(
        TencentVideoModel,
      );
      expect(provider.video('kling-video-v3').provider).toBe('tencent.video');
    });

    it('throws NoSuchModelError for unsupported video model IDs', () => {
      expect(() => createTencent().video('not-a-model')).toThrow(
        NoSuchModelError,
      );
    });

    it('signs VOD requests with configured credentials', async () => {
      await startVideo(
        createTencent({
          secretId: 'AKIDEXAMPLE',
          secretKey: 'EXAMPLESECRET',
          subAppId: '1500000000',
          region: 'ap-singapore',
          headers: { 'x-custom': 'value' },
        }).video('vod/VS/2.0'),
      );

      const call = server.calls[0];
      expect(call.requestHeaders.authorization).toMatch(
        /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\//,
      );
      expect(call.requestHeaders['x-tc-region']).toBe('ap-singapore');
      expect(call.requestHeaders['x-custom']).toBe('value');
      expect(call.requestUserAgent).toContain('ai-sdk-tencent/0.0.0-test');
      expect(await call.requestBodyJson).toMatchObject({
        SubAppId: 1500000000,
      });
    });

    it('reads VOD credentials from the environment', async () => {
      vi.stubEnv('TENCENTCLOUD_SECRET_ID', 'AKIDENV');
      vi.stubEnv('TENCENTCLOUD_SECRET_KEY', 'ENVSECRET');
      vi.stubEnv('TENCENTCLOUD_VOD_SUB_APP_ID', '1500000001');

      await startVideo(createTencent().video('vod/VS/2.0'));

      expect(server.calls[0].requestHeaders.authorization).toMatch(
        /^TC3-HMAC-SHA256 Credential=AKIDENV\//,
      );
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        SubAppId: 1500000001,
      });
    });

    it('rejects an invalid SubAppId', async () => {
      await expect(
        startVideo(
          createTencent({
            secretId: 'AKIDEXAMPLE',
            secretKey: 'EXAMPLESECRET',
            subAppId: 'not-a-number',
          }).video('vod/VS/2.0'),
        ),
      ).rejects.toThrow('Tencent VOD SubAppId must be a positive integer.');
    });

    it('does not need VOD credentials for TokenHub video models', () => {
      expect(() =>
        createTencent({ apiKey: 'test-key' }).video('kling-video-v3'),
      ).not.toThrow();
    });
  });

  it('throws NoSuchModelError for embedding and image models', () => {
    const provider = createTencent();
    expect(() => provider.embeddingModel('model')).toThrow(NoSuchModelError);
    expect(() => provider.textEmbeddingModel('model')).toThrow(
      NoSuchModelError,
    );
    expect(() => provider.imageModel('model')).toThrow(NoSuchModelError);
  });
});
