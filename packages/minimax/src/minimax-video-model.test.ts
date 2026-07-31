import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { MiniMaxVideoModel } from './minimax-video-model';

const prompt = 'A white kitten chases a butterfly across a sunlit garden.';

const TEST_BASE_URL = 'https://api.example.com';
const TASK_ID = 'task-123';

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

describe('MiniMaxVideoModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/v2/video_generation`]: {
      response: { type: 'json-value', body: createVideoResponse },
    },
    [`${TEST_BASE_URL}/v2/query/video_generation/${TASK_ID}`]: {
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
      ).toBe(false);
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
            referenceAudioUrls: ['https://cdn.example.com/ref.wav'],
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
});
