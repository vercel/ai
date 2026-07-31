import type {
  JSONValue,
  SharedV4ProviderOptions,
  Experimental_VideoModelV4File as VideoModelV4File,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { MiniMaxVideoModel } from './minimax-video-model';

const prompt = 'A white kitten chases a butterfly across a sunlit garden.';

const TEST_BASE_URL = 'https://api.example.com';
const TASK_ID = 'task-123';

const CREATE_URL = `${TEST_BASE_URL}/v2/video_generation`;
const POLL_URL = `${TEST_BASE_URL}/v2/query/video_generation/${TASK_ID}`;

const createVideoResponse = { task_id: TASK_ID };

const succeededStatusResponse = {
  task: {
    id: TASK_ID,
    model: 'MiniMax-H3',
    status: 'succeeded',
    content: { url: 'https://cdn.minimax.io/output/video-001.mp4' },
    resolution: '2K',
    duration: 5,
    ratio: '16:9',
    usage: { total_seconds: 5, input_seconds: 0, output_seconds: 5 },
    task_type: 'generation',
    modality: 'video',
  },
};

/** A non-terminal status body, used to force another poll iteration. */
function pendingStatusResponse(status: 'queued' | 'running') {
  return { task: { id: TASK_ID, status } };
}

/**
 * The MiniMax error envelope, which the failed-response handler reduces to
 * `error.message`.
 */
function errorEnvelope(message: string, httpCode: number) {
  return JSON.stringify({
    type: 'error',
    error: { type: 'invalid_request_error', message, http_code: httpCode },
    request_id: 'req-err-001',
  });
}

/**
 * The fast poll settings every test needs, plus any provider options under
 * test. Spelled out inline in the older tests below.
 */
function minimaxOptions(
  options: Record<string, JSONValue> = {},
): SharedV4ProviderOptions {
  return {
    minimax: { pollIntervalMs: 10, pollTimeoutMs: 5000, ...options },
  };
}

const defaultOptions = {
  prompt,
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
  providerOptions: {
    minimax: {
      pollIntervalMs: 10,
      pollTimeoutMs: 5000,
    },
  },
} as const;

function createModel({
  currentDate,
  fetch,
}: {
  currentDate?: () => Date;
  fetch?: FetchFunction;
} = {}) {
  return new MiniMaxVideoModel('MiniMax-H3', {
    provider: 'minimax.video',
    baseURL: TEST_BASE_URL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
    _internal: { currentDate },
  });
}

const imageUrlFile = {
  type: 'url' as const,
  url: 'https://cdn.example.com/first.png',
  mediaType: 'image/png',
};

const videoUrlFile: VideoModelV4File = {
  type: 'url',
  url: 'https://cdn.example.com/clip.mp4',
  mediaType: 'video/mp4',
};

describe('MiniMaxVideoModel', () => {
  const server = createTestServer({
    [CREATE_URL]: {
      response: { type: 'json-value', body: createVideoResponse },
    },
    [POLL_URL]: {
      response: { type: 'json-value', body: succeededStatusResponse },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('minimax.video');
      expect(model.modelId).toBe('MiniMax-H3');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxVideosPerCall).toBe(1);
    });
  });

  describe('doGenerate', () => {
    it('should send a text-to-video request with required fields', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        `${TEST_BASE_URL}/v2/video_generation`,
      );
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
    });

    it('should return the video URL from the completed task', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toStrictEqual([
        {
          type: 'url',
          url: 'https://cdn.minimax.io/output/video-001.mp4',
          mediaType: 'video/mp4',
        },
      ]);
      expect(result.providerMetadata?.minimax?.taskId).toBe(TASK_ID);
    });

    it('should map aspectRatio and duration into the request', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
        duration: 10,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 10,
        ratio: '16:9',
      });
    });

    it('should clamp a duration above the maximum and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        duration: 20,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 15,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'duration',
        details:
          '20 exceeds the MiniMax-H3 maximum of 15 seconds. clamped to 15',
      });
    });

    it('should clamp a duration below the minimum and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        duration: 3,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'duration',
        details: '3 is below the MiniMax-H3 minimum of 5 seconds. clamped to 5',
      });
    });

    it('should map a top-level resolution onto the named tier', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        resolution: '2560x1440',
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(
        warnings.some(
          w => w.type === 'unsupported' && w.feature === 'resolution',
        ),
      ).toBe(false);
    });

    it('should warn and use the default for an unrecognized resolution', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(
        warnings.some(
          w => w.type === 'unsupported' && w.feature === 'resolution',
        ),
      ).toBe(true);
    });

    it('should prefer providerOptions.resolution over the top-level value', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
        providerOptions: {
          minimax: {
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
            resolution: '2K',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(
        warnings.some(
          w => w.type === 'unsupported' && w.feature === 'resolution',
        ),
      ).toBe(true);
    });

    it('should send first/last frame images with roles and ignore ratio', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
        frameImages: [
          { image: imageUrlFile, frameType: 'first_frame' },
          {
            image: {
              type: 'url',
              url: 'https://cdn.example.com/last.png',
              mediaType: 'image/png',
            },
            frameType: 'last_frame',
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/first.png' },
            role: 'first_frame',
          },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/last.png' },
            role: 'last_frame',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      expect(
        warnings.some(
          w => w.type === 'unsupported' && w.feature === 'aspectRatio',
        ),
      ).toBe(true);
    });

    it('should route inputReferences into reference_image/reference_video', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        inputReferences: [
          imageUrlFile,
          {
            type: 'url',
            url: 'https://cdn.example.com/ref.mp4',
            mediaType: 'video/mp4',
          },
        ],
        providerOptions: {
          minimax: {
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
            referenceAudio: ['https://cdn.example.com/ref.wav'],
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/first.png' },
            role: 'reference_image',
          },
          {
            type: 'video_url',
            video_url: { url: 'https://cdn.example.com/ref.mp4' },
            role: 'reference_video',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://cdn.example.com/ref.wav' },
            role: 'reference_audio',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
    });

    it('should treat a URL reference without a mediaType as an image and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        inputReferences: [
          { type: 'url', url: 'https://cdn.example.com/ref.mp4' },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/ref.mp4' },
            role: 'reference_image',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'MiniMax-H3 requires an explicit mediaType to route URL references as ' +
          'video or image. Pass { data: url, mediaType: "video/mp4" } for video ' +
          'references. The reference was treated as an image.',
      });
    });

    it('should ignore a reference that is neither an image nor a video and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        inputReferences: [
          imageUrlFile,
          {
            type: 'url',
            url: 'https://cdn.example.com/ref.mp3',
            mediaType: 'audio/mp3',
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/first.png' },
            role: 'reference_image',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'MiniMax-H3 only accepts image and video references; the "audio/mp3" ' +
          'reference was ignored. Pass reference audio via ' +
          'providerOptions.minimax.referenceAudio.',
      });
    });

    it('should warn about unsupported fps, seed, and n', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        fps: 30,
        seed: 42,
        n: 2,
      });

      const features = warnings
        .filter(w => w.type === 'unsupported')
        .map(w => w.feature);
      expect(features).toContain('fps');
      expect(features).toContain('seed');
      expect(features).toContain('n');
    });

    // The inputs above are capped or rejected client-side, and a warning does
    // not say how many survived. `resolvedInputs` reports what was sent, so
    // callers metering usage do not have to re-derive these rules.
    describe('resolvedInputs', () => {
      function imageReference(index: number) {
        return {
          type: 'url' as const,
          url: `https://cdn.example.com/img-${index}.png`,
          mediaType: 'image/png',
        };
      }

      function videoReference(index: number) {
        return {
          type: 'url' as const,
          url: `https://cdn.example.com/vid-${index}.mp4`,
          mediaType: 'video/mp4',
        };
      }

      async function resolvedInputs(
        options: Partial<Parameters<MiniMaxVideoModel['doGenerate']>[0]> = {},
      ) {
        const result = await createModel().doGenerate({
          ...defaultOptions,
          ...options,
        });
        return result.providerMetadata?.minimax?.resolvedInputs;
      }

      it('should report nothing sent for a text-only request', async () => {
        expect(await resolvedInputs()).toStrictEqual({
          imageCount: 0,
          referenceVideoUrls: [],
        });
      });

      it('should count both a first_frame and a last_frame', async () => {
        expect(
          await resolvedInputs({
            frameImages: [
              { image: imageUrlFile, frameType: 'first_frame' },
              { image: imageReference(1), frameType: 'last_frame' },
            ],
          }),
        ).toStrictEqual({ imageCount: 2, referenceVideoUrls: [] });
      });

      it('should count a reference with no media type as an image', async () => {
        expect(
          await resolvedInputs({
            inputReferences: [
              { type: 'url', url: 'https://cdn.example.com/unknown' },
            ],
          }),
        ).toStrictEqual({ imageCount: 1, referenceVideoUrls: [] });
      });

      it('should split mixed references into images and videos', async () => {
        expect(
          await resolvedInputs({
            inputReferences: [imageReference(0), videoReference(0)],
          }),
        ).toStrictEqual({
          imageCount: 1,
          referenceVideoUrls: ['https://cdn.example.com/vid-0.mp4'],
        });
      });

      it('should cap the reported image count at 9 reference images', async () => {
        expect(
          await resolvedInputs({
            inputReferences: Array.from({ length: 12 }, (_, index) =>
              imageReference(index),
            ),
          }),
        ).toStrictEqual({ imageCount: 9, referenceVideoUrls: [] });
      });

      it('should report only the first 3 reference videos', async () => {
        expect(
          await resolvedInputs({
            inputReferences: Array.from({ length: 5 }, (_, index) =>
              videoReference(index),
            ),
          }),
        ).toStrictEqual({
          imageCount: 0,
          referenceVideoUrls: [
            'https://cdn.example.com/vid-0.mp4',
            'https://cdn.example.com/vid-1.mp4',
            'https://cdn.example.com/vid-2.mp4',
          ],
        });
      });

      it('should omit inline reference videos, which have no URL to report', async () => {
        expect(
          await resolvedInputs({
            inputReferences: [
              {
                type: 'file',
                data: 'AAAA',
                mediaType: 'video/mp4',
              },
            ],
          }),
        ).toStrictEqual({ imageCount: 0, referenceVideoUrls: [] });
      });

      it('should report no references in frame-image mode, which drops them', async () => {
        expect(
          await resolvedInputs({
            frameImages: [{ image: imageUrlFile, frameType: 'first_frame' }],
            inputReferences: [imageReference(0), videoReference(0)],
          }),
        ).toStrictEqual({ imageCount: 1, referenceVideoUrls: [] });
      });

      it('should treat a standalone image as a frame image, dropping references', async () => {
        expect(
          await resolvedInputs({
            image: imageUrlFile,
            inputReferences: [imageReference(0), videoReference(0)],
          }),
        ).toStrictEqual({ imageCount: 1, referenceVideoUrls: [] });
      });

      it('should report nothing for a video passed as a first_frame', async () => {
        expect(
          await resolvedInputs({
            frameImages: [
              { image: videoReference(0), frameType: 'first_frame' },
            ],
          }),
        ).toStrictEqual({ imageCount: 0, referenceVideoUrls: [] });
      });

      it('should report nothing for a last_frame with no first_frame', async () => {
        expect(
          await resolvedInputs({
            frameImages: [{ image: imageUrlFile, frameType: 'last_frame' }],
          }),
        ).toStrictEqual({ imageCount: 0, referenceVideoUrls: [] });
      });

      it('should count a duplicated first_frame once', async () => {
        expect(
          await resolvedInputs({
            frameImages: [
              { image: imageUrlFile, frameType: 'first_frame' },
              { image: imageReference(1), frameType: 'first_frame' },
            ],
          }),
        ).toStrictEqual({ imageCount: 1, referenceVideoUrls: [] });
      });
    });
  });

  describe('request body', () => {
    it('should map aigcWatermark to aigc_watermark', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: minimaxOptions({ aigcWatermark: true }),
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
        aigc_watermark: true,
      });
    });

    it('should send aigc_watermark when it is explicitly disabled', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: minimaxOptions({ aigcWatermark: false }),
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        aigc_watermark: false,
      });
    });

    it('should omit aigc_watermark when it is unset', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'aigc_watermark',
      );
    });

    it('should prefer providerOptions.minimax.ratio over the top-level aspectRatio', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
        providerOptions: minimaxOptions({ ratio: '9:16' }),
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
        ratio: '9:16',
      });
      expect(warnings).toStrictEqual([]);
    });

    it('should support the adaptive ratio, which has no top-level equivalent', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        providerOptions: minimaxOptions({ ratio: 'adaptive' }),
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        ratio: 'adaptive',
      });
      expect(warnings).toStrictEqual([]);
    });

    it('should warn and send no ratio for an unsupported aspectRatio', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '5:3',
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty('ratio');
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'MiniMax-H3 does not support the aspect ratio "5:3". Using the provider default (adaptive).',
      });
    });

    it('should encode an inline Uint8Array frame image as a data URI', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        frameImages: [
          {
            image: {
              type: 'file',
              data: new Uint8Array([1, 2, 3]),
              mediaType: 'image/png',
            },
            frameType: 'first_frame',
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AQID' },
            role: 'first_frame',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
    });

    it('should pass an inline base64 string frame image through as a data URI', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        frameImages: [
          {
            image: {
              type: 'file',
              data: 'AQID',
              mediaType: 'image/jpeg',
            },
            frameType: 'first_frame',
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,AQID' },
            role: 'first_frame',
          },
        ],
      });
    });

    it('should encode an inline Uint8Array reference video as a data URI', async () => {
      const model = createModel();

      const { providerMetadata } = await model.doGenerate({
        ...defaultOptions,
        inputReferences: [
          {
            type: 'file',
            data: new Uint8Array([4, 5, 6]),
            mediaType: 'video/mp4',
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'video_url',
            video_url: { url: 'data:video/mp4;base64,BAUG' },
            role: 'reference_video',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      // Data URIs are not echoed back through `resolvedInputs`.
      expect(providerMetadata?.minimax?.resolvedInputs).toStrictEqual({
        imageCount: 0,
        referenceVideoUrls: [],
      });
    });

    it('should pass an inline base64 string reference video through as a data URI', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        inputReferences: [
          { type: 'file', data: 'BAUG', mediaType: 'video/webm' },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        content: [
          { type: 'text', text: prompt },
          {
            type: 'video_url',
            video_url: { url: 'data:video/webm;base64,BAUG' },
            role: 'reference_video',
          },
        ],
      });
    });
  });

  describe('warnings', () => {
    it('should return no warnings for a plain text-to-video request', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({ ...defaultOptions });

      expect(warnings).toStrictEqual([]);
    });

    it.each([true, false])(
      'should warn when generateAudio is %s',
      async generateAudio => {
        const model = createModel();

        const { warnings } = await model.doGenerate({
          ...defaultOptions,
          generateAudio,
        });

        expect(warnings).toContainEqual({
          type: 'unsupported',
          feature: 'generateAudio',
          details:
            'The MiniMax-H3 API does not expose an audio parameter. The generateAudio option was ignored.',
        });
      },
    );

    it('should warn on a resolution conflict with providerOptions.minimax.resolution', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
        providerOptions: minimaxOptions({ resolution: '2K' }),
      });

      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'resolution',
        details:
          'The resolution "1280x720" was ignored because ' +
          'providerOptions.minimax.resolution ("2K") takes precedence.',
      });
    });

    it('should drop reference audio that is not paired with an image or video reference', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        providerOptions: minimaxOptions({
          referenceAudio: ['https://cdn.example.com/ref.wav'],
        }),
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'referenceAudio',
        details:
          'MiniMax-H3 reference audio must be paired with at least one reference image or video. The audio was ignored.',
      });
    });

    it('should cap reference audio at 3 entries and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        inputReferences: [imageUrlFile],
        providerOptions: minimaxOptions({
          referenceAudio: [
            'https://cdn.example.com/a1.wav',
            'https://cdn.example.com/a2.wav',
            'https://cdn.example.com/a3.wav',
            'https://cdn.example.com/a4.wav',
          ],
        }),
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/first.png' },
            role: 'reference_image',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://cdn.example.com/a1.wav' },
            role: 'reference_audio',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://cdn.example.com/a2.wav' },
            role: 'reference_audio',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://cdn.example.com/a3.wav' },
            role: 'reference_audio',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'referenceAudio',
        details:
          'MiniMax-H3 accepts at most 3 reference audios. Extra audios were ignored.',
      });
    });

    it('should cap reference images at 9 and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        inputReferences: Array.from({ length: 12 }, (_, index) => ({
          type: 'url' as const,
          url: `https://cdn.example.com/img-${index}.png`,
          mediaType: 'image/png',
        })),
      });

      const content = (await server.calls[0].requestBodyJson).content;
      expect(content).toHaveLength(10);
      expect(
        content.filter(
          (part: { role?: string }) => part.role === 'reference_image',
        ),
      ).toHaveLength(9);
      expect(content.at(-1).image_url.url).toBe(
        'https://cdn.example.com/img-8.png',
      );
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'MiniMax-H3 accepts at most 9 reference images. Extra images were ignored.',
      });
    });

    it('should cap reference videos at 3 and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        inputReferences: Array.from({ length: 5 }, (_, index) => ({
          type: 'url' as const,
          url: `https://cdn.example.com/vid-${index}.mp4`,
          mediaType: 'video/mp4',
        })),
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'video_url',
            video_url: { url: 'https://cdn.example.com/vid-0.mp4' },
            role: 'reference_video',
          },
          {
            type: 'video_url',
            video_url: { url: 'https://cdn.example.com/vid-1.mp4' },
            role: 'reference_video',
          },
          {
            type: 'video_url',
            video_url: { url: 'https://cdn.example.com/vid-2.mp4' },
            role: 'reference_video',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'MiniMax-H3 accepts at most 3 reference videos. Extra videos were ignored.',
      });
    });

    it('should drop inputReferences when frame images are present and warn', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        frameImages: [{ image: imageUrlFile, frameType: 'first_frame' }],
        inputReferences: [videoUrlFile],
        providerOptions: minimaxOptions({
          referenceAudio: ['https://cdn.example.com/ref.wav'],
        }),
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/first.png' },
            role: 'first_frame',
          },
        ],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'MiniMax-H3 cannot combine frame images with reference inputs. The references were ignored.',
      });
    });

    it.each([5, 15])(
      'should not warn for a duration of %i seconds, which is in range',
      async duration => {
        const model = createModel();

        const { warnings } = await model.doGenerate({
          ...defaultOptions,
          duration,
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          duration,
        });
        expect(warnings).toStrictEqual([]);
      },
    );

    it('should attribute a video first_frame from frameImages to the frameImages feature', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        frameImages: [{ image: videoUrlFile, frameType: 'first_frame' }],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'frameImages',
        details:
          'MiniMax-H3 does not accept a video as a frame image. The video was ignored.',
      });
    });

    it('should attribute a video standalone image to the image feature', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        image: videoUrlFile,
      });

      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'image',
        details:
          'MiniMax-H3 does not accept a video as a frame image. The video was ignored.',
      });
    });

    it('should warn when the last_frame is a video', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        frameImages: [
          { image: imageUrlFile, frameType: 'first_frame' },
          { image: videoUrlFile, frameType: 'last_frame' },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/first.png' },
            role: 'first_frame',
          },
        ],
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'frameImages',
        details:
          'MiniMax-H3 does not accept a video as a frame image. The last_frame video was ignored.',
      });
    });

    it('should warn when a last_frame is given without a first_frame', async () => {
      const model = createModel();

      const { warnings } = await model.doGenerate({
        ...defaultOptions,
        frameImages: [{ image: imageUrlFile, frameType: 'last_frame' }],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: prompt }],
        resolution: '2K',
        duration: 5,
      });
      expect(warnings).toContainEqual({
        type: 'unsupported',
        feature: 'frameImages',
        details:
          'MiniMax-H3 requires a first_frame when a last_frame is provided. The last_frame was ignored.',
      });
    });
  });

  describe('response', () => {
    it('should include the timestamp, modelId, and poll response headers', async () => {
      const testDate = new Date('2024-03-04T05:06:07Z');
      server.urls[POLL_URL].response = {
        type: 'json-value',
        headers: { 'x-minimax-request-id': 'req-abc' },
        body: succeededStatusResponse,
      };

      const model = createModel({ currentDate: () => testDate });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'MiniMax-H3',
        headers: expect.any(Object),
      });
      expect(result.response.headers).toMatchObject({
        'x-minimax-request-id': 'req-abc',
      });
    });

    it('should return the full provider metadata from the completed task', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.providerMetadata).toStrictEqual({
        minimax: {
          taskId: TASK_ID,
          videoUrl: 'https://cdn.minimax.io/output/video-001.mp4',
          resolvedInputs: { imageCount: 0, referenceVideoUrls: [] },
          duration: 5,
          ratio: '16:9',
          resolution: '2K',
          usage: { totalSeconds: 5, inputSeconds: 0, outputSeconds: 5 },
        },
      });
    });
  });

  describe('request headers', () => {
    it('should send the configured auth header on the create and poll calls', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
      });
      expect(server.calls[1].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
      });
    });

    it('should merge per-request headers into the create and poll calls', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        headers: { 'x-request-header': 'request-value' },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'x-request-header': 'request-value',
      });
      expect(server.calls[1].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'x-request-header': 'request-value',
      });
    });

    it('should let a per-request header override the configured header', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        headers: { Authorization: 'Bearer override-key' },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer override-key',
      });
    });

    it('should poll with GET on the task status URL', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[1].requestMethod).toBe('GET');
      expect(server.calls[1].requestUrl).toBe(POLL_URL);
    });
  });

  describe('polling', () => {
    it('should keep polling through queued and running until succeeded', async () => {
      // `callNumber` counts every request: 0 is the create call, 1+ are polls.
      server.urls[POLL_URL].response = ({ callNumber }) => {
        if (callNumber === 1) {
          return {
            type: 'json-value' as const,
            body: pendingStatusResponse('queued'),
          };
        }
        if (callNumber === 2) {
          return {
            type: 'json-value' as const,
            body: pendingStatusResponse('running'),
          };
        }
        return { type: 'json-value' as const, body: succeededStatusResponse };
      };

      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toStrictEqual([
        {
          type: 'url',
          url: 'https://cdn.minimax.io/output/video-001.mp4',
          mediaType: 'video/mp4',
        },
      ]);
      // 1 create call + 3 polls.
      expect(server.calls).toHaveLength(4);
    });

    it('should keep polling on an unknown status', async () => {
      server.urls[POLL_URL].response = ({ callNumber }) =>
        callNumber === 1
          ? {
              type: 'json-value' as const,
              body: { task: { id: TASK_ID, status: 'something-new' } },
            }
          : { type: 'json-value' as const, body: succeededStatusResponse };

      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(server.calls).toHaveLength(3);
    });

    it('should throw when polling exceeds pollTimeoutMs', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: pendingStatusResponse('running'),
      };

      const model = createModel();

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: minimaxOptions({
            pollIntervalMs: 10,
            pollTimeoutMs: 30,
          }),
        }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_TIMEOUT',
        message: 'MiniMax video generation timed out after 30ms',
      });
    });
  });

  describe('abort signal', () => {
    it('should forward the abort signal to the create and poll calls', async () => {
      const abortController = new AbortController();
      const signals: Array<AbortSignal | null | undefined> = [];

      const fetch: FetchFunction = async (url, init) => {
        signals.push(init?.signal);

        return new Response(
          JSON.stringify(
            url.toString().includes('/query/')
              ? succeededStatusResponse
              : createVideoResponse,
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const model = createModel({ fetch });

      await model.doGenerate({
        ...defaultOptions,
        abortSignal: abortController.signal,
      });

      expect(signals).toHaveLength(2);
      expect(signals[0]).toBe(abortController.signal);
      expect(signals[1]).toBe(abortController.signal);
    });

    it('should stop polling once the signal is aborted', async () => {
      const abortController = new AbortController();
      let pollCount = 0;

      const fetch: FetchFunction = async url => {
        if (url.toString().includes('/query/')) {
          pollCount++;
          // Abort while the first poll is in flight.
          abortController.abort();
          return new Response(
            JSON.stringify(pendingStatusResponse('running')),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(JSON.stringify(createVideoResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const model = createModel({ fetch });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          abortSignal: abortController.signal,
        }),
      ).rejects.toMatchObject({
        name: 'AbortError',
        message: expect.stringContaining('aborted'),
      });
      expect(pollCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should throw when the task failed, including the error message and code', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: {
          task: {
            id: TASK_ID,
            status: 'failed',
            error: { code: 1027, message: 'Content policy violation' },
          },
        },
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_FAILED',
        message:
          'MiniMax video generation failed: Content policy violation (1027)',
      });
    });

    it('should throw a bare failure message when the task carries no error object', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { task: { id: TASK_ID, status: 'failed' } },
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_FAILED',
        message: 'MiniMax video generation failed',
      });
    });

    it('should throw when the task was cancelled', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { task: { id: TASK_ID, status: 'cancelled' } },
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_CANCELLED',
        message: 'MiniMax video generation was cancelled.',
      });
    });

    it('should throw when the task expired', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { task: { id: TASK_ID, status: 'expired' } },
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_EXPIRED',
        message: 'MiniMax video generation request expired.',
      });
    });

    it('should throw when a succeeded task has no video URL', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { task: { id: TASK_ID, status: 'succeeded', content: {} } },
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_ERROR',
        message:
          'MiniMax video generation completed but no video URL was returned.',
      });
    });

    it('should throw when a succeeded task has no content at all', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { task: { id: TASK_ID, status: 'succeeded' } },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'no video URL was returned',
      );
    });

    it('should throw when the create call returns no task_id', async () => {
      server.urls[CREATE_URL].response = {
        type: 'json-value',
        body: {},
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'MINIMAX_VIDEO_GENERATION_ERROR',
        message: 'No task_id returned from the MiniMax API. Response: {}',
      });
      // The poll loop is never entered.
      expect(server.calls).toHaveLength(1);
    });

    it('should throw when the create call returns an empty task_id', async () => {
      server.urls[CREATE_URL].response = {
        type: 'json-value',
        body: { task_id: '' },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No task_id returned from the MiniMax API',
      );
    });

    it('should surface the MiniMax error message from a failed create call', async () => {
      server.urls[CREATE_URL].response = {
        type: 'error',
        status: 400,
        body: errorEnvelope('invalid duration', 400),
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'invalid duration',
        statusCode: 400,
        url: CREATE_URL,
      });
    });

    it('should surface the MiniMax error message from a failed poll call', async () => {
      server.urls[POLL_URL].response = {
        type: 'error',
        status: 500,
        body: errorEnvelope('internal server error', 500),
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'internal server error',
        statusCode: 500,
        url: POLL_URL,
      });
    });

    it('should fall back to a generic message when the error envelope has no message', async () => {
      server.urls[CREATE_URL].response = {
        type: 'error',
        status: 401,
        body: JSON.stringify({ type: 'error', request_id: 'req-err-002' }),
      };

      const model = createModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        message: 'MiniMax video generation error',
        statusCode: 401,
      });
    });
  });
});
