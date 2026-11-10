import { AISDKError, APICallError, NoSuchModelError } from '@ai-sdk/provider';
import {
  createTestServer,
  type UrlResponse,
} from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { TencentVideoModel } from './tencent-video-model';

const TOKENHUB_BASE_URL = 'https://tokenhub-intl.tencentcloudmaas.com/v1';
const VOD_URL = 'https://vod.intl.tencentcloudapi.com';
const TASK_ID = 'task-123';

const defaultOptions = {
  prompt: 'A cat walking on a beach',
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

const currentDate = new Date('2026-11-08T00:00:00.000Z');

function createModel(modelId: string) {
  return new TencentVideoModel(modelId, {
    provider: 'tencent.video',
    tokenHub: {
      baseURL: TOKENHUB_BASE_URL,
      headers: () => ({ Authorization: 'Bearer test-key' }),
    },
    vod: {
      baseURL: VOD_URL,
      credentials: () => ({
        secretId: 'AKIDEXAMPLE',
        secretKey: 'EXAMPLESECRET',
        subAppId: 1500000000,
      }),
      headers: () => ({ 'x-vod-header': 'vod' }),
    },
    _internal: { currentDate: () => currentDate },
  });
}

// Polls every 1 ms so tests do not wait the default 5 s interval.
function generate(
  model: TencentVideoModel,
  options: Parameters<TencentVideoModel['doGenerate']>[0],
) {
  return model.doGenerate({
    ...options,
    providerOptions: {
      ...options.providerOptions,
      tencent: { pollIntervalMs: 1, ...options.providerOptions?.tencent },
    },
  });
}

const vodCreatedResponse = {
  type: 'json-value' as const,
  body: { Response: { TaskId: TASK_ID, RequestId: 'req-vod-1' } },
};

const vodFinishedResponse = {
  type: 'json-value' as const,
  body: {
    Response: {
      TaskType: 'AigcVideoTask',
      Status: 'FINISH',
      RequestId: 'req-vod-2',
      AigcVideoTask: {
        TaskId: TASK_ID,
        Status: 'FINISH',
        ErrCode: 0,
        Output: { FileInfos: [{ FileUrl: 'https://vod.example.com/out.mp4' }] },
      },
    },
  },
};

// VOD serves CreateAigcVideoTask and DescribeTaskDetail on one URL: the first
// call is the submit, later calls are status polls.
function vodPolled(
  ...polls: UrlResponse[]
): (options: { callNumber: number }) => UrlResponse {
  return ({ callNumber }) =>
    callNumber === 0
      ? vodCreatedResponse
      : (polls[Math.min(callNumber - 1, polls.length - 1)] ??
        vodFinishedResponse);
}

const submittedResponse = {
  type: 'json-value' as const,
  body: {
    code: 0,
    message: 'SUCCEED',
    request_id: 'req-1',
    data: { id: TASK_ID, status: 'submitted' },
  },
};

describe('TencentVideoModel', () => {
  const server = createTestServer({
    [`${TOKENHUB_BASE_URL}/wand/kling/text-to-video`]: {
      response: submittedResponse,
    },
    [`${TOKENHUB_BASE_URL}/wand/kling/image-to-video`]: {
      response: submittedResponse,
    },
    [`${TOKENHUB_BASE_URL}/wand/kling/omni-video`]: {
      response: submittedResponse,
    },
    [`${TOKENHUB_BASE_URL}/wand/kling/motion-control`]: {
      response: submittedResponse,
    },
    [`${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`]: {
      response: {
        type: 'json-value',
        body: {
          code: 0,
          message: 'SUCCEED',
          request_id: 'req-2',
          data: [
            {
              id: TASK_ID,
              status: 'succeeded',
              outputs: [
                {
                  type: 'video',
                  id: 'video-1',
                  url: 'https://cdn.example.com/video.mp4',
                  duration: '5.041',
                },
              ],
            },
          ],
          tokenhub_usage: { total_tokens: 12345 },
        },
      },
    },
    // Submit, then one finished status poll. Initial routes are cloned, so
    // they cannot use a response function.
    [VOD_URL]: {
      response: [vodCreatedResponse, vodFinishedResponse],
    },
  });

  describe('constructor', () => {
    it('exposes provider and model information', () => {
      const model = createModel('kling-video-v3');
      expect(model.provider).toBe('tencent.video');
      expect(model.modelId).toBe('kling-video-v3');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it.each(['unknown-model', 'vod/VS', 'vod//2.0', 'vod/VS/'])(
      'rejects the unsupported model ID %s',
      modelId => {
        expect(() => createModel(modelId)).toThrow(NoSuchModelError);
      },
    );
  });

  describe('TokenHub Kling', () => {
    describe('text-to-video', () => {
      it('sends prompt and settings', async () => {
        const result = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          aspectRatio: '16:9',
          duration: 5,
          resolution: '1920x1080',
          generateAudio: true,
        });

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/text-to-video`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v3',
          prompt: 'A cat walking on a beach',
          settings: {
            resolution: '1080p',
            aspect_ratio: '16:9',
            duration: 5,
            audio: 'native',
          },
        });
        expect(server.calls[0].requestHeaders.authorization).toBe(
          'Bearer test-key',
        );
        expect(result.providerMetadata?.tencent?.taskId).toBe(TASK_ID);
        expect(result.warnings).toStrictEqual([]);
        expect(result.response).toStrictEqual({
          timestamp: currentDate,
          modelId: 'kling-video-v3',
          headers: expect.any(Object),
        });
      });

      it('sends multi-shot, watermark and external task ID', async () => {
        await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          providerOptions: {
            tencent: {
              multiShot: false,
              watermark: true,
              externalTaskId: 'my-task',
              resolution: '4k',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v3',
          prompt: 'A cat walking on a beach',
          settings: { resolution: '4k', multi_shot: false },
          options: {
            external_task_id: 'my-task',
            watermark_info: { enabled: true },
          },
        });
      });

      it('omits audio and multi-shot for models that do not support them', async () => {
        const result = await generate(createModel('kling-video-v4'), {
          ...defaultOptions,
          generateAudio: true,
          providerOptions: { tencent: { multiShot: true } },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v4',
          prompt: 'A cat walking on a beach',
        });
        expect(result.warnings).toStrictEqual([
          expect.objectContaining({ feature: 'generateAudio' }),
          expect.objectContaining({
            feature: 'providerOptions.tencent.multiShot',
          }),
        ]);
      });

      it('warns on unsupported options', async () => {
        const result = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          seed: 42,
          fps: 24,
          n: 2,
          resolution: '640x480',
          providerOptions: { tencent: { negativePrompt: 'dogs' } },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v3',
          prompt: 'A cat walking on a beach',
        });
        expect(result.warnings.map(warning => warning.type)).toStrictEqual([
          'unsupported',
          'unsupported',
          'unsupported',
          'unsupported',
          'unsupported',
        ]);
        expect(
          result.warnings.map(warning =>
            warning.type === 'unsupported' ? warning.feature : undefined,
          ),
        ).toStrictEqual([
          'fps',
          'n',
          'seed',
          'providerOptions.tencent.negativePrompt',
          'resolution',
        ]);
      });
    });

    describe('image-to-video', () => {
      it('sends first and last frames as contents', async () => {
        const result = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          aspectRatio: '9:16',
          duration: 10,
          frameImages: [
            {
              frameType: 'first_frame',
              image: { type: 'url', url: 'https://example.com/first.png' },
            },
            {
              frameType: 'last_frame',
              image: {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([1, 2, 3]),
              },
            },
          ],
          providerOptions: {
            tencent: { elements: [{ elementId: 'element-1' }] },
          },
        });

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/image-to-video`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v3',
          contents: [
            { type: 'prompt', text: 'A cat walking on a beach' },
            { type: 'first_frame', url: 'https://example.com/first.png' },
            { type: 'last_frame', url: 'data:image/png;base64,AQID' },
            { type: 'element', element_id: 'element-1' },
          ],
          settings: { duration: 10 },
        });
        expect(result.warnings).toStrictEqual([
          expect.objectContaining({ feature: 'aspectRatio' }),
        ]);
      });

      it('uses the legacy image option as the first frame', async () => {
        await generate(createModel('kling-video-v3-turbo'), {
          ...defaultOptions,
          image: { type: 'file', mediaType: 'image/jpeg', data: 'AAAA' },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v3-turbo',
          contents: [
            { type: 'prompt', text: 'A cat walking on a beach' },
            { type: 'first_frame', url: 'data:image/jpeg;base64,AAAA' },
          ],
        });
      });

      it('ignores references on models without omni support', async () => {
        const result = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          inputReferences: [
            { type: 'url', url: 'https://example.com/ref.png' },
          ],
        });

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/text-to-video`,
        );
        expect(result.warnings).toStrictEqual([
          expect.objectContaining({ feature: 'inputReferences' }),
        ]);
      });
    });

    describe('omni', () => {
      it('sends reference images and videos to the omni endpoint', async () => {
        await generate(createModel('kling-video-v3-omni'), {
          ...defaultOptions,
          aspectRatio: '1:1',
          inputReferences: [
            { type: 'url', url: 'https://example.com/ref.png' },
            {
              type: 'url',
              url: 'https://example.com/ref.mp4',
              mediaType: 'video/mp4',
            },
          ],
          providerOptions: {
            tencent: { referenceVideoType: 'base', audio: 'original' },
          },
        });

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/omni-video`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v3-omni',
          contents: [
            { type: 'prompt', text: 'A cat walking on a beach' },
            { type: 'refer_image', url: 'https://example.com/ref.png' },
            { type: 'base_video', url: 'https://example.com/ref.mp4' },
          ],
          settings: { aspect_ratio: '1:1', audio: 'original' },
        });
      });

      it('routes kling-video-v4 with references and voices to the omni endpoint', async () => {
        await generate(createModel('kling-video-v4'), {
          ...defaultOptions,
          aspectRatio: 'adaptive',
          inputReferences: [
            {
              type: 'url',
              url: 'https://example.com/motion.mp4',
              mediaType: 'video/mp4',
            },
          ],
          providerOptions: {
            tencent: { voices: [{ voiceId: 'voice-1', id: '1' }] },
          },
        });

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/omni-video`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v4',
          contents: [
            { type: 'prompt', text: 'A cat walking on a beach' },
            { type: 'feature_video', url: 'https://example.com/motion.mp4' },
            { type: 'voice', voice_id: 'voice-1', id: '1' },
          ],
          settings: { aspect_ratio: 'adaptive' },
        });
      });

      it('routes kling-video-v4 with elements and no first frame to the omni endpoint', async () => {
        const result = await generate(createModel('kling-video-v4'), {
          ...defaultOptions,
          providerOptions: {
            tencent: { elements: [{ elementId: 'element-1' }] },
          },
        });

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/omni-video`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-v4',
          contents: [
            { type: 'prompt', text: 'A cat walking on a beach' },
            { type: 'element', element_id: 'element-1' },
          ],
        });
        expect(result.warnings).toStrictEqual([]);
      });
    });

    describe('motion control', () => {
      it('sends the character image and motion video', async () => {
        const result = await generate(
          createModel('kling-video-motion-control-v3.0'),
          {
            ...defaultOptions,
            duration: 5,
            generateAudio: false,
            image: { type: 'url', url: 'https://example.com/character.png' },
            inputReferences: [
              {
                type: 'url',
                url: 'https://example.com/motion.mp4',
                mediaType: 'video/mp4',
              },
            ],
            providerOptions: {
              tencent: {
                characterOrientation: 'video',
                elements: [{ elementId: 'element-1', id: 'e1' }],
              },
            },
          },
        );

        expect(server.calls[0].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/motion-control`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-motion-control-v3.0',
          contents: [
            { type: 'prompt', text: 'A cat walking on a beach' },
            { type: 'image', url: 'https://example.com/character.png' },
            { type: 'video', url: 'https://example.com/motion.mp4' },
            { type: 'element', element_id: 'element-1', id: 'e1' },
          ],
          settings: { character_orientation: 'video', audio: 'off' },
        });
        expect(result.warnings).toStrictEqual([
          expect.objectContaining({ feature: 'duration' }),
        ]);
      });

      it('uses the first image reference as the character image', async () => {
        await generate(createModel('kling-video-motion-control-v2.6'), {
          ...defaultOptions,
          prompt: undefined,
          inputReferences: [
            { type: 'url', url: 'https://example.com/character.png' },
            {
              type: 'url',
              url: 'https://example.com/motion.mp4',
              mediaType: 'video/mp4',
            },
          ],
          providerOptions: { tencent: { characterOrientation: 'image' } },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'kling-video-motion-control-v2.6',
          contents: [
            { type: 'image', url: 'https://example.com/character.png' },
            { type: 'video', url: 'https://example.com/motion.mp4' },
          ],
          settings: { character_orientation: 'image' },
        });
      });
    });

    describe('errors', () => {
      it('throws when the response has a non-zero code', async () => {
        server.urls[`${TOKENHUB_BASE_URL}/wand/kling/text-to-video`].response =
          {
            type: 'json-value',
            body: { code: 1201, message: 'Invalid model', request_id: 'r' },
          };

        const error = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
        }).catch(e => e);

        expect(APICallError.isInstance(error)).toBe(true);
        expect(error.message).toBe('Invalid model');
        expect(error.isRetryable).toBe(false);
      });

      it('surfaces HTTP error messages', async () => {
        server.urls[`${TOKENHUB_BASE_URL}/wand/kling/text-to-video`].response =
          {
            type: 'error',
            status: 401,
            body: JSON.stringify({
              error: { message: 'Invalid API key', type: 'auth_error' },
            }),
          };

        const error = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
        }).catch(e => e);

        expect(APICallError.isInstance(error)).toBe(true);
        expect(error.statusCode).toBe(401);
        expect(error.message).toBe('Invalid API key');
      });

      it('throws when no task ID is returned', async () => {
        server.urls[`${TOKENHUB_BASE_URL}/wand/kling/text-to-video`].response =
          { type: 'json-value', body: { code: 0, data: {} } };

        await expect(
          generate(createModel('kling-video-v3'), { ...defaultOptions }),
        ).rejects.toMatchObject({
          message: 'No task ID returned from TokenHub.',
        });
      });
    });

    describe('polling', () => {
      it('returns videos and usage for a succeeded task', async () => {
        const result = await generate(
          createModel('kling-video-v3'),
          defaultOptions,
        );

        expect(server.calls[1].requestMethod).toBe('GET');
        expect(server.calls[1].requestUrl).toBe(
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`,
        );
        expect(server.calls[1].requestHeaders.authorization).toBe(
          'Bearer test-key',
        );
        expect(result).toStrictEqual({
          videos: [
            {
              type: 'url',
              url: 'https://cdn.example.com/video.mp4',
              mediaType: 'video/mp4',
            },
          ],
          warnings: [],
          response: {
            timestamp: currentDate,
            modelId: 'kling-video-v3',
            headers: expect.any(Object),
          },
          providerMetadata: {
            tencent: {
              taskId: TASK_ID,
              requestId: 'req-2',
              videos: [
                {
                  id: 'video-1',
                  url: 'https://cdn.example.com/video.mp4',
                  duration: 5.041,
                },
              ],
              usage: { totalTokens: 12345 },
            },
          },
        });
      });

      it('accepts a single task object in data', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = {
          type: 'json-value',
          body: {
            code: 0,
            data: {
              id: TASK_ID,
              status: 'succeeded',
              outputs: [{ url: 'https://cdn.example.com/video.mp4' }],
            },
          },
        };

        const result = await generate(
          createModel('kling-video-v3'),
          defaultOptions,
        );

        expect(result.videos).toStrictEqual([
          {
            type: 'url',
            url: 'https://cdn.example.com/video.mp4',
            mediaType: 'video/mp4',
          },
        ]);
      });

      it('keeps polling while the task is processing', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = ({ callNumber }) => ({
          type: 'json-value',
          body:
            callNumber === 1
              ? { code: 0, data: [{ id: TASK_ID, status: 'processing' }] }
              : {
                  code: 0,
                  data: [
                    {
                      id: TASK_ID,
                      status: 'succeeded',
                      outputs: [{ url: 'https://cdn.example.com/video.mp4' }],
                    },
                  ],
                },
        });

        const result = await generate(
          createModel('kling-video-v3'),
          defaultOptions,
        );

        expect(server.calls).toHaveLength(3);
        expect(result.videos).toHaveLength(1);
      });

      it('throws when the task fails', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = {
          type: 'json-value',
          body: {
            code: 0,
            data: [{ id: TASK_ID, status: 'failed', message: 'risk control' }],
          },
        };

        const error = await generate(
          createModel('kling-video-v3'),
          defaultOptions,
        ).catch(e => e);

        expect(AISDKError.isInstance(error)).toBe(true);
        expect(error.name).toBe('TENCENT_VIDEO_GENERATION_FAILED');
        expect(error.message).toBe(
          `Video generation failed: risk control (task ${TASK_ID})`,
        );
      });

      it('throws when the task does not finish within pollTimeoutMs', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = {
          type: 'json-value',
          body: { code: 0, data: [{ id: TASK_ID, status: 'processing' }] },
        };

        const error = await generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          providerOptions: { tencent: { pollTimeoutMs: 20 } },
        }).catch(e => e);

        expect(AISDKError.isInstance(error)).toBe(true);
        expect(error.name).toBe('TENCENT_VIDEO_GENERATION_TIMEOUT');
        expect(error.message).toBe(
          `Video generation timed out after 20ms (task ${TASK_ID})`,
        );
      });

      it('stops polling when aborted', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = {
          type: 'json-value',
          body: { code: 0, data: [{ id: TASK_ID, status: 'processing' }] },
        };
        const controller = new AbortController();

        const pending = generate(createModel('kling-video-v3'), {
          ...defaultOptions,
          abortSignal: controller.signal,
          providerOptions: { tencent: { pollIntervalMs: 50 } },
        });
        setTimeout(() => controller.abort(), 10);

        await expect(pending).rejects.toThrow();
        expect(server.calls).toHaveLength(1);
      });
    });
  });

  describe('VOD', () => {
    it('submits a signed CreateAigcVideoTask request', async () => {
      const result = await generate(createModel('vod/VS/2.0'), {
        ...defaultOptions,
        aspectRatio: '16:9',
        duration: 8,
        resolution: '1280x720',
        seed: 7,
        generateAudio: true,
        frameImages: [
          {
            frameType: 'first_frame',
            image: { type: 'url', url: 'https://example.com/first.png' },
          },
        ],
        inputReferences: [
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: new Uint8Array([1, 2, 3]),
          },
          {
            type: 'url',
            url: 'https://example.com/voice.mp3',
            mediaType: 'audio/mpeg',
          },
        ],
        providerOptions: {
          tencent: {
            negativePrompt: 'dogs',
            enhancePrompt: false,
            inputRegion: 'Oversea',
            watermark: false,
            referenceVideoType: 'feature',
            sessionId: 'session-1',
          },
        },
      });

      const call = server.calls[0];
      expect(call.requestUrl).toBe(`${VOD_URL}/`);
      expect(call.requestHeaders['x-tc-action']).toBe('CreateAigcVideoTask');
      expect(call.requestHeaders['x-tc-version']).toBe('2018-07-17');
      expect(call.requestHeaders['x-tc-timestamp']).toBe('1794096000');
      expect(call.requestHeaders['x-vod-header']).toBe('vod');
      expect(call.requestHeaders.authorization).toMatch(
        /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\/2026-11-08\/vod\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[0-9a-f]{64}$/,
      );
      expect(await call.requestBodyJson).toStrictEqual({
        SubAppId: 1500000000,
        ModelName: 'VS',
        ModelVersion: '2.0',
        Prompt: 'A cat walking on a beach',
        NegativePrompt: 'dogs',
        EnhancePrompt: 'Disabled',
        FileInfos: [
          {
            Type: 'Url',
            Url: 'https://example.com/first.png',
            Category: 'Image',
            Usage: 'FirstFrame',
          },
          {
            Type: 'Base64',
            Base64: 'AQID',
            Category: 'Video',
            Usage: 'Reference',
            ReferenceType: 'feature',
          },
          {
            Type: 'Url',
            Url: 'https://example.com/voice.mp3',
            Category: 'Audio',
            Usage: 'Reference',
          },
        ],
        OutputConfig: {
          StorageMode: 'Temporary',
          Resolution: '720P',
          AspectRatio: '16:9',
          Duration: 8,
          AudioGeneration: 'Enabled',
          LogoAdd: 'Disabled',
        },
        InputRegion: 'Oversea',
        Seed: 7,
        SessionId: 'session-1',
      });
      expect(result.providerMetadata?.tencent?.taskId).toBe(TASK_ID);
      expect(result.warnings).toStrictEqual([]);
    });

    it('warns about TokenHub-only options', async () => {
      const result = await generate(createModel('vod/Kling/3.0'), {
        ...defaultOptions,
        providerOptions: {
          tencent: { multiShot: true, characterOrientation: 'image' },
        },
      });

      expect(result.warnings).toStrictEqual([
        expect.objectContaining({
          feature: 'providerOptions.tencent.multiShot',
        }),
        expect.objectContaining({
          feature: 'providerOptions.tencent.characterOrientation',
        }),
      ]);
    });

    it('sends assets as URL file inputs', async () => {
      await generate(createModel('vod/VS/2.0'), {
        ...defaultOptions,
        providerOptions: {
          tencent: {
            assets: [
              { url: 'asset://asset-1' },
              { url: 'asset://asset-2', usage: 'FirstFrame' },
              { url: 'asset://asset-3', category: 'Video' },
            ],
          },
        },
      });

      expect((await server.calls[0].requestBodyJson).FileInfos).toStrictEqual([
        {
          Type: 'Url',
          Url: 'asset://asset-1',
          Category: 'Image',
          Usage: 'Reference',
        },
        {
          Type: 'Url',
          Url: 'asset://asset-2',
          Category: 'Image',
          Usage: 'FirstFrame',
        },
        {
          Type: 'Url',
          Url: 'asset://asset-3',
          Category: 'Video',
          Usage: 'Reference',
        },
      ]);
    });

    it('ignores asset frames when that frame is already set', async () => {
      const result = await generate(createModel('vod/VS/2.0'), {
        ...defaultOptions,
        image: { type: 'url', url: 'https://example.com/first.png' },
        providerOptions: {
          tencent: {
            assets: [
              { url: 'asset://asset-1', usage: 'FirstFrame' },
              { url: 'asset://asset-2', usage: 'LastFrame' },
              { url: 'asset://asset-3', usage: 'LastFrame' },
            ],
          },
        },
      });

      expect(
        (await server.calls[0].requestBodyJson).FileInfos.map(
          (file: { Usage: string; Url: string }) => [file.Usage, file.Url],
        ),
      ).toStrictEqual([
        ['FirstFrame', 'https://example.com/first.png'],
        ['LastFrame', 'asset://asset-2'],
      ]);
      expect(result.warnings).toStrictEqual([
        expect.objectContaining({
          feature: 'providerOptions.tencent.assets',
          details:
            'VOD accepts one first frame; the asset asset://asset-1 was ignored.',
        }),
        expect.objectContaining({
          feature: 'providerOptions.tencent.assets',
          details:
            'VOD accepts one last frame; the asset asset://asset-3 was ignored.',
        }),
      ]);
    });

    it('throws an APICallError for Response.Error', async () => {
      server.urls[VOD_URL].response = {
        type: 'json-value',
        body: {
          Response: {
            Error: {
              Code: 'InvalidParameterValue.SubAppId',
              Message: 'Invalid SubAppId.',
            },
            RequestId: 'req-vod-err',
          },
        },
      };

      const error = await generate(createModel('vod/VS/2.0'), {
        ...defaultOptions,
      }).catch(e => e);

      expect(APICallError.isInstance(error)).toBe(true);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe(
        'InvalidParameterValue.SubAppId: Invalid SubAppId.',
      );
    });

    describe('polling', () => {
      it('returns videos and usage for a finished task', async () => {
        server.urls[VOD_URL].response = vodPolled({
          type: 'json-value',
          body: {
            Response: {
              TaskType: 'AigcVideoTask',
              Status: 'FINISH',
              RequestId: 'req-vod-2',
              AigcVideoTask: {
                TaskId: TASK_ID,
                Status: 'FINISH',
                ErrCode: 0,
                Message: '',
                Progress: 100,
                Input: {
                  ModelName: 'VS',
                  ModelVersion: '2.0',
                  OutputConfig: {
                    StorageMode: 'Temporary',
                    Duration: 8,
                    Resolution: '720P',
                    AspectRatio: '16:9',
                    AudioGeneration: '',
                  },
                },
                Output: {
                  FileInfos: [
                    {
                      FileUrl: 'https://vod.example.com/out.mp4',
                      FileType: 'mp4',
                      FileId: '',
                      MetaData: { Duration: 8.04 },
                    },
                  ],
                  Usage: {
                    InputTokens: 0,
                    ThoughtTokens: 0,
                    InputImageCount: 0,
                    InputSeconds: 5,
                    OutputSeconds: 8,
                    TotalSeconds: 13,
                    SpecificationUsages: [
                      {
                        Specification: 'SV2.0_720P',
                        Category: 'aigc_video_sv2_720',
                      },
                    ],
                  },
                },
              },
            },
          },
        });

        const result = await generate(
          createModel('vod/VS/2.0'),
          defaultOptions,
        );

        expect(server.calls[1].requestHeaders['x-tc-action']).toBe(
          'DescribeTaskDetail',
        );
        expect(await server.calls[1].requestBodyJson).toStrictEqual({
          TaskId: TASK_ID,
          SubAppId: 1500000000,
        });
        expect(result).toStrictEqual({
          videos: [
            {
              type: 'url',
              url: 'https://vod.example.com/out.mp4',
              mediaType: 'video/mp4',
            },
          ],
          warnings: [],
          response: {
            timestamp: currentDate,
            modelId: 'vod/VS/2.0',
            headers: expect.any(Object),
          },
          providerMetadata: {
            tencent: {
              taskId: TASK_ID,
              requestId: 'req-vod-2',
              resolution: '720P',
              videos: [
                { url: 'https://vod.example.com/out.mp4', duration: 8.04 },
              ],
              usage: {
                inputImageCount: 0,
                inputSeconds: 5,
                inputTokens: 0,
                outputSeconds: 8,
                specificationUsages: [
                  {
                    specification: 'SV2.0_720P',
                    category: 'aigc_video_sv2_720',
                  },
                ],
                thoughtTokens: 0,
                totalSeconds: 13,
              },
            },
          },
        });
      });

      it('returns the last-frame image as metadata instead of a video', async () => {
        server.urls[VOD_URL].response = vodPolled({
          type: 'json-value',
          body: {
            Response: {
              TaskType: 'AigcVideoTask',
              Status: 'FINISH',
              AigcVideoTask: {
                TaskId: TASK_ID,
                Status: 'FINISH',
                ErrCode: 0,
                Output: {
                  FileInfos: [
                    {
                      FileUrl: 'https://vod.example.com/out.mp4',
                      FileType: '',
                      UsageType: '',
                      MetaData: { Duration: 4.04 },
                    },
                    {
                      FileUrl: 'https://vod.example.com/last.png',
                      FileType: '',
                      UsageType: 'last_frame_url',
                      MetaData: null,
                    },
                  ],
                  Usage: { OutputSeconds: 4 },
                },
              },
            },
          },
        });

        const result = await generate(
          createModel('vod/VS/2.0'),
          defaultOptions,
        );

        expect(result.videos).toStrictEqual([
          {
            type: 'url',
            url: 'https://vod.example.com/out.mp4',
            mediaType: 'video/mp4',
          },
        ]);
        expect(result.providerMetadata).toStrictEqual({
          tencent: {
            taskId: TASK_ID,
            lastFrameUrl: 'https://vod.example.com/last.png',
            videos: [
              { url: 'https://vod.example.com/out.mp4', duration: 4.04 },
            ],
            usage: { outputSeconds: 4 },
          },
        });
      });

      it('skips file entries with an empty URL', async () => {
        server.urls[VOD_URL].response = vodPolled({
          type: 'json-value',
          body: {
            Response: {
              TaskType: 'AigcVideoTask',
              Status: 'FINISH',
              AigcVideoTask: {
                TaskId: TASK_ID,
                Status: 'FINISH',
                ErrCode: 0,
                Output: {
                  FileInfos: [
                    { FileUrl: '' },
                    { FileUrl: 'https://vod.example.com/out.mp4' },
                  ],
                },
              },
            },
          },
        });

        const result = await generate(
          createModel('vod/VS/2.0'),
          defaultOptions,
        );

        expect(result.videos).toStrictEqual([
          {
            type: 'url',
            url: 'https://vod.example.com/out.mp4',
            mediaType: 'video/mp4',
          },
        ]);
      });

      it('omits an empty resolution and empty specification usages', async () => {
        server.urls[VOD_URL].response = vodPolled({
          type: 'json-value',
          body: {
            Response: {
              TaskType: 'AigcVideoTask',
              Status: 'FINISH',
              AigcVideoTask: {
                TaskId: TASK_ID,
                Status: 'FINISH',
                ErrCode: 0,
                Input: { OutputConfig: { Resolution: '' } },
                Output: {
                  FileInfos: [{ FileUrl: 'https://vod.example.com/out.mp4' }],
                  Usage: {
                    OutputSeconds: 4,
                    SpecificationUsages: [{ Specification: '', Category: '' }],
                  },
                },
              },
            },
          },
        });

        const result = await generate(
          createModel('vod/VS/2.0'),
          defaultOptions,
        );

        expect(result.videos).toHaveLength(1);
        expect(result.providerMetadata).toStrictEqual({
          tencent: {
            taskId: TASK_ID,
            videos: [{ url: 'https://vod.example.com/out.mp4', duration: 4 }],
            usage: { outputSeconds: 4 },
          },
        });
      });

      it.each(['WAITING', 'PROCESSING'])(
        'keeps polling while the task is %s',
        async status => {
          server.urls[VOD_URL].response = vodPolled(
            {
              type: 'json-value',
              body: { Response: { TaskType: 'AigcVideoTask', Status: status } },
            },
            vodFinishedResponse,
          );

          const result = await generate(
            createModel('vod/VS/2.0'),
            defaultOptions,
          );

          expect(server.calls).toHaveLength(3);
          expect(result.videos).toHaveLength(1);
        },
      );

      it('throws when the task fails', async () => {
        server.urls[VOD_URL].response = vodPolled({
          type: 'json-value',
          body: {
            Response: {
              TaskType: 'AigcVideoTask',
              Status: 'FINISH',
              AigcVideoTask: {
                Status: 'FINISH',
                ErrCode: 70000,
                ErrCodeExt: 'ContentModerationFailed',
                Message: 'Content moderation failed.',
              },
            },
          },
        });

        const error = await generate(
          createModel('vod/VS/2.0'),
          defaultOptions,
        ).catch(e => e);

        expect(AISDKError.isInstance(error)).toBe(true);
        expect(error.name).toBe('TENCENT_VIDEO_GENERATION_FAILED');
        expect(error.message).toBe(
          `Video generation failed (ContentModerationFailed): Content moderation failed. (task ${TASK_ID})`,
        );
      });

      it('throws when the task is aborted', async () => {
        server.urls[VOD_URL].response = vodPolled({
          type: 'json-value',
          body: { Response: { TaskType: 'AigcVideoTask', Status: 'ABORTED' } },
        });

        await expect(
          generate(createModel('vod/VS/2.0'), defaultOptions),
        ).rejects.toThrow(`Video generation aborted (task ${TASK_ID})`);
      });
    });
  });
});
