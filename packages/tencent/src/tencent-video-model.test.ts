import { APICallError, NoSuchModelError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
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
    [VOD_URL]: {
      response: {
        type: 'json-value',
        body: { Response: { TaskId: TASK_ID, RequestId: 'req-vod-1' } },
      },
    },
  });

  describe('constructor', () => {
    it('exposes provider and model information', () => {
      const model = createModel('kling-video-v3');
      expect(model.provider).toBe('tencent.video');
      expect(model.modelId).toBe('kling-video-v3');
      expect(model.specificationVersion).toBe('v4');
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
        const result = await createModel('kling-video-v3').doStart({
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
        expect(result.operation).toStrictEqual({ taskId: TASK_ID });
        expect(result.warnings).toStrictEqual([]);
        expect(result.response).toStrictEqual({
          timestamp: currentDate,
          modelId: 'kling-video-v3',
          headers: expect.any(Object),
        });
      });

      it('sends multi-shot, watermark and external task ID', async () => {
        await createModel('kling-video-v3').doStart({
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
        const result = await createModel('kling-video-v4').doStart({
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
        const result = await createModel('kling-video-v3').doStart({
          ...defaultOptions,
          seed: 42,
          fps: 24,
          n: 2,
          resolution: '640x480',
          webhookUrl: 'https://example.com/webhook',
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
          'webhookUrl',
          'providerOptions.tencent.negativePrompt',
          'resolution',
        ]);
      });
    });

    describe('image-to-video', () => {
      it('sends first and last frames as contents', async () => {
        const result = await createModel('kling-video-v3').doStart({
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
        await createModel('kling-video-v3-turbo').doStart({
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
        const result = await createModel('kling-video-v3').doStart({
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
        await createModel('kling-video-v3-omni').doStart({
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
        await createModel('kling-video-v4').doStart({
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
    });

    describe('motion control', () => {
      it('sends the character image and motion video', async () => {
        const result = await createModel(
          'kling-video-motion-control-v3.0',
        ).doStart({
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
        });

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
        await createModel('kling-video-motion-control-v2.6').doStart({
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

        const error = await createModel('kling-video-v3')
          .doStart({ ...defaultOptions })
          .catch(e => e);

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

        const error = await createModel('kling-video-v3')
          .doStart({ ...defaultOptions })
          .catch(e => e);

        expect(APICallError.isInstance(error)).toBe(true);
        expect(error.statusCode).toBe(401);
        expect(error.message).toBe('Invalid API key');
      });

      it('throws when no task ID is returned', async () => {
        server.urls[`${TOKENHUB_BASE_URL}/wand/kling/text-to-video`].response =
          { type: 'json-value', body: { code: 0, data: {} } };

        await expect(
          createModel('kling-video-v3').doStart({ ...defaultOptions }),
        ).rejects.toMatchObject({
          message: 'No task ID returned from TokenHub.',
        });
      });
    });

    describe('doStatus', () => {
      it('returns videos and usage for a succeeded task', async () => {
        const result = await createModel('kling-video-v3').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(server.calls[0].requestMethod).toBe('GET');
        expect(server.calls[0].requestHeaders.authorization).toBe(
          'Bearer test-key',
        );
        expect(result).toStrictEqual({
          status: 'completed',
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
                  duration: '5.041',
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

        const result = await createModel('kling-video-v3').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(result.status).toBe('completed');
      });

      it('returns pending for a processing task', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = {
          type: 'json-value',
          body: { code: 0, data: [{ id: TASK_ID, status: 'processing' }] },
        };

        const result = await createModel('kling-video-v3').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(result.status).toBe('pending');
      });

      it('returns an error for a failed task', async () => {
        server.urls[
          `${TOKENHUB_BASE_URL}/wand/kling/tasks/${TASK_ID}`
        ].response = {
          type: 'json-value',
          body: {
            code: 0,
            data: [{ id: TASK_ID, status: 'failed', message: 'risk control' }],
          },
        };

        const result = await createModel('kling-video-v3').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(result).toMatchObject({
          status: 'error',
          error: `Video generation failed: risk control (task ${TASK_ID})`,
        });
      });
    });
  });

  describe('VOD', () => {
    it('submits a signed CreateAigcVideoTask request', async () => {
      const result = await createModel('vod/VS/2.0').doStart({
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
      expect(result.operation).toStrictEqual({ taskId: TASK_ID });
      expect(result.warnings).toStrictEqual([]);
    });

    it('warns about TokenHub-only options', async () => {
      const result = await createModel('vod/Kling/3.0').doStart({
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

      const error = await createModel('vod/VS/2.0')
        .doStart({ ...defaultOptions })
        .catch(e => e);

      expect(APICallError.isInstance(error)).toBe(true);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe(
        'InvalidParameterValue.SubAppId: Invalid SubAppId.',
      );
    });

    describe('doStatus', () => {
      it('returns videos and usage for a finished task', async () => {
        server.urls[VOD_URL].response = {
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
        };

        const result = await createModel('vod/VS/2.0').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(server.calls[0].requestHeaders['x-tc-action']).toBe(
          'DescribeTaskDetail',
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          TaskId: TASK_ID,
          SubAppId: 1500000000,
        });
        expect(result).toStrictEqual({
          status: 'completed',
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

      it('omits an empty resolution and empty specification usages', async () => {
        server.urls[VOD_URL].response = {
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
        };

        const result = await createModel('vod/VS/2.0').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(result.status).toBe('completed');
        expect(
          result.status === 'completed' && result.providerMetadata,
        ).toStrictEqual({
          tencent: {
            taskId: TASK_ID,
            videos: [{ url: 'https://vod.example.com/out.mp4', duration: 4 }],
            usage: { outputSeconds: 4 },
          },
        });
      });

      it.each(['WAITING', 'PROCESSING'])(
        'returns pending for status %s',
        async status => {
          server.urls[VOD_URL].response = {
            type: 'json-value',
            body: { Response: { TaskType: 'AigcVideoTask', Status: status } },
          };

          const result = await createModel('vod/VS/2.0').doStatus({
            operation: { taskId: TASK_ID },
          });

          expect(result.status).toBe('pending');
        },
      );

      it('returns an error for a failed task', async () => {
        server.urls[VOD_URL].response = {
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
        };

        const result = await createModel('vod/VS/2.0').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(result).toMatchObject({
          status: 'error',
          error: `Video generation failed (ContentModerationFailed): Content moderation failed. (task ${TASK_ID})`,
        });
      });

      it('returns an error for an aborted task', async () => {
        server.urls[VOD_URL].response = {
          type: 'json-value',
          body: { Response: { TaskType: 'AigcVideoTask', Status: 'ABORTED' } },
        };

        const result = await createModel('vod/VS/2.0').doStatus({
          operation: { taskId: TASK_ID },
        });

        expect(result.status).toBe('error');
      });
    });
  });
});
