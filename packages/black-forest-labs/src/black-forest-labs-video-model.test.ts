import type {
  Experimental_VideoModelV4CallOptions,
  Experimental_VideoModelV4File,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { BlackForestLabsVideoModel } from './black-forest-labs-video-model';

const prompt = 'A white kitten chases a butterfly across a sunlit garden.';

const TEST_BASE_URL = 'https://api.example.com/v1';
const SUBMIT_URL = `${TEST_BASE_URL}/flux-3-video`;
const POLL_URL = 'https://api.example.com/poll';
const VIDEO_URL = 'https://api.example.com/output/video-001.mp4';
const REQUEST_ID = 'req-123';

const submitResponse = {
  id: REQUEST_ID,
  polling_url: POLL_URL,
  cost: 0.42,
  input_mp: 1.23,
  output_mp: 4.56,
};

const readyResponse = {
  status: 'Ready',
  result: { sample: VIDEO_URL, seed: 7, duration: 8 },
};

function createModel({
  currentDate,
  fetch,
  pollIntervalMillis = 1,
  pollTimeoutMillis = 5000,
}: {
  currentDate?: () => Date;
  fetch?: FetchFunction;
  pollIntervalMillis?: number;
  pollTimeoutMillis?: number;
} = {}) {
  return new BlackForestLabsVideoModel('flux-3-video', {
    provider: 'black-forest-labs.video',
    baseURL: TEST_BASE_URL,
    headers: () => ({ 'x-key': 'test-key' }),
    fetch,
    pollIntervalMillis,
    pollTimeoutMillis,
    _internal: { currentDate },
  });
}

const defaultOptions: Experimental_VideoModelV4CallOptions = {
  prompt,
  n: 1,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  image: undefined,
  frameImages: undefined,
  inputReferences: undefined,
  generateAudio: undefined,
  providerOptions: {},
};

const imageUrlFile: Experimental_VideoModelV4File = {
  type: 'url',
  url: 'https://cdn.example.com/first.png',
  mediaType: 'image/png',
};

const lastImageUrlFile: Experimental_VideoModelV4File = {
  type: 'url',
  url: 'https://cdn.example.com/last.png',
  mediaType: 'image/png',
};

const videoUrlFile: Experimental_VideoModelV4File = {
  type: 'url',
  url: 'https://cdn.example.com/clip.mp4',
  mediaType: 'video/mp4',
};

describe('BlackForestLabsVideoModel', () => {
  const server = createTestServer({
    [SUBMIT_URL]: {
      response: { type: 'json-value', body: submitResponse },
    },
    [POLL_URL]: {
      response: { type: 'json-value', body: readyResponse },
    },
  });

  async function requestBody() {
    return server.calls[0].requestBodyJson;
  }

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('black-forest-labs.video');
      expect(model.modelId).toBe('flux-3-video');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it('should support workflow serialization', () => {
      const serialized = BlackForestLabsVideoModel[WORKFLOW_SERIALIZE](
        createModel({
          currentDate: () => new Date(0),
          fetch: async () => new Response(),
        }),
      );

      expect(serialized).toEqual({
        modelId: 'flux-3-video',
        config: {
          provider: 'black-forest-labs.video',
          baseURL: TEST_BASE_URL,
          headers: { 'x-key': 'test-key' },
          pollIntervalMillis: 1,
          pollTimeoutMillis: 5000,
        },
      });

      const model = BlackForestLabsVideoModel[WORKFLOW_DESERIALIZE]({
        modelId: 'flux-3-video',
        config: serialized.config as {
          provider: string;
          baseURL: string;
          headers: Record<string, string>;
        },
      });

      expect(model.provider).toBe('black-forest-labs.video');
      expect(model.modelId).toBe('flux-3-video');
    });
  });

  describe('text-to-video', () => {
    it('should submit a t2v request with only the fields that were set', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(SUBMIT_URL);
      expect(await requestBody()).toStrictEqual({
        mode: 't2v',
        prompt,
      });
    });

    it('should return the signed video URL rather than downloading it', async () => {
      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.videos).toStrictEqual([
        { type: 'url', url: VIDEO_URL, mediaType: 'video/mp4' },
      ]);
      // Submit + poll only: the video itself is never fetched.
      expect(server.calls).toHaveLength(2);
    });

    it('should report the submit cost and megapixels in providerMetadata', async () => {
      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.providerMetadata?.blackForestLabs?.videos).toStrictEqual([
        {
          id: REQUEST_ID,
          videoUrl: VIDEO_URL,
          seed: 7,
          duration: 8,
          cost: 0.42,
          inputMegapixels: 1.23,
          outputMegapixels: 4.56,
        },
      ]);
    });

    // The submit response can only estimate, and returns null whenever the
    // price depends on the finished video. `get_result` then answers with the
    // `SettledCostResultResponse` variant, which carries the real charge.
    it('should prefer the settled cost from the result over the submit estimate', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { ...readyResponse, cost: 0.85 },
      };

      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.providerMetadata?.blackForestLabs?.videos).toStrictEqual([
        {
          id: REQUEST_ID,
          videoUrl: VIDEO_URL,
          seed: 7,
          duration: 8,
          cost: 0.85,
          inputMegapixels: 1.23,
          outputMegapixels: 4.56,
        },
      ]);
    });

    it('should report the settled cost when the submit response omits one', async () => {
      server.urls[SUBMIT_URL].response = {
        type: 'json-value',
        body: { id: REQUEST_ID, polling_url: POLL_URL },
      };
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { ...readyResponse, cost: 0.85 },
      };

      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.providerMetadata?.blackForestLabs?.videos).toStrictEqual([
        {
          id: REQUEST_ID,
          videoUrl: VIDEO_URL,
          seed: 7,
          duration: 8,
          cost: 0.85,
        },
      ]);
    });

    // The plain `ResultResponse` variant has no cost at all.
    it('should omit cost entirely when neither response reports one', async () => {
      server.urls[SUBMIT_URL].response = {
        type: 'json-value',
        body: { id: REQUEST_ID, polling_url: POLL_URL },
      };

      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.providerMetadata?.blackForestLabs?.videos).toStrictEqual([
        {
          id: REQUEST_ID,
          videoUrl: VIDEO_URL,
          seed: 7,
          duration: 8,
        },
      ]);
    });

    it('should send an empty prompt when none is provided', async () => {
      await createModel().doGenerate({ ...defaultOptions, prompt: undefined });

      expect(await requestBody()).toStrictEqual({ mode: 't2v', prompt: '' });
    });
  });

  describe('generateAudio', () => {
    it('should pass generateAudio through as generate_audio', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        generateAudio: true,
      });

      expect(await requestBody()).toMatchObject({ generate_audio: true });
    });

    it('should send generate_audio when it is explicitly disabled', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        generateAudio: false,
      });

      expect(await requestBody()).toMatchObject({ generate_audio: false });
    });

    it('should omit generate_audio when it is unset, leaving the API default', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      expect(await requestBody()).not.toHaveProperty('generate_audio');
    });
  });

  describe('aspect ratio', () => {
    it('should send a supported aspect ratio', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        aspectRatio: '21:9',
      });

      expect(await requestBody()).toMatchObject({ aspect_ratio: '21:9' });
    });

    it('should warn and omit an unsupported aspect ratio', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        aspectRatio: '5:2',
      });

      expect(await requestBody()).not.toHaveProperty('aspect_ratio');
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'FLUX 3 video does not support the aspect ratio "5:2". Using the provider default (auto).',
      });
    });

    it('should prefer providerOptions.aspectRatio, which can express auto', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
        providerOptions: { blackForestLabs: { aspectRatio: 'auto' } },
      });

      expect(await requestBody()).toMatchObject({ aspect_ratio: 'auto' });
    });
  });

  describe('resolution', () => {
    it('should pass a named tier through', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        resolution: 'fhd' as never,
      });

      expect(await requestBody()).toMatchObject({ resolution: 'fhd' });
    });

    it('should accept a named tier case-insensitively', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        resolution: 'FHD' as never,
      });

      expect(await requestBody()).toMatchObject({ resolution: 'fhd' });
    });

    it('should map 1280x720 onto hd without warning', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
      });

      expect(await requestBody()).toMatchObject({ resolution: 'hd' });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should map 1920x1080 onto fhd without warning', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      expect(await requestBody()).toMatchObject({ resolution: 'fhd' });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should snap an in-between resolution to a tier and report it', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        resolution: '854x480',
      });

      expect(await requestBody()).toMatchObject({ resolution: 'hd' });
      expect(result.warnings).toContainEqual({
        type: 'compatibility',
        feature: 'resolution',
        details:
          'FLUX 3 video renders at "hd" or "fhd"; the requested resolution "854x480" was mapped to "hd".',
      });
    });

    it('should warn and omit an unparseable resolution', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        resolution: 'huge' as never,
      });

      expect(await requestBody()).not.toHaveProperty('resolution');
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'resolution',
        details:
          'Unrecognized resolution "huge". FLUX 3 video supports "hd" and "fhd", or a {width}x{height} value to map onto one.',
      });
    });

    it('should prefer providerOptions.resolution over the top-level value', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
        providerOptions: { blackForestLabs: { resolution: 'hd' } },
      });

      expect(await requestBody()).toMatchObject({ resolution: 'hd' });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should keep providerOptions.resolution and warn when the top-level value is unrecognized', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        resolution: 'huge' as never,
        providerOptions: { blackForestLabs: { resolution: 'fhd' } },
      });

      expect(await requestBody()).toMatchObject({ resolution: 'fhd' });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'resolution',
        details:
          'Unrecognized resolution "huge". FLUX 3 video supports "hd" and "fhd", so providerOptions.blackForestLabs.resolution ("fhd") was used instead.',
      });
    });
  });

  describe('duration', () => {
    it('should send an in-range duration', async () => {
      await createModel().doGenerate({ ...defaultOptions, duration: 12 });

      expect(await requestBody()).toMatchObject({ duration: 12 });
    });

    it('should omit duration when unset, leaving the API default of auto', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      expect(await requestBody()).not.toHaveProperty('duration');
    });

    it('should clamp a duration above the maximum and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        duration: 30,
      });

      expect(await requestBody()).toMatchObject({ duration: 20 });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'duration',
        details:
          'FLUX 3 video supports at most 20 seconds. The requested duration of 30 was clamped to 20.',
      });
    });

    it('should clamp a duration below the minimum and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        duration: 2,
      });

      expect(await requestBody()).toMatchObject({ duration: 5 });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'duration',
        details:
          'FLUX 3 video requires at least 5 seconds. The requested duration of 2 was clamped to 5.',
      });
    });

    it('should round a fractional duration and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        duration: 7.4,
      });

      expect(await requestBody()).toMatchObject({ duration: 7 });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'duration',
        details:
          'FLUX 3 video requires a whole number of seconds. The requested duration of 7.4 was rounded to 7.',
      });
    });

    it('should round and then clamp a fractional out-of-range duration', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        duration: 24.6,
      });

      expect(await requestBody()).toMatchObject({ duration: 20 });
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('image-to-video', () => {
    it('should turn a standalone image into a single keyframe', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        image: imageUrlFile,
      });

      expect(await requestBody()).toStrictEqual({
        mode: 'i2v',
        prompt,
        keyframes: [imageUrlFile.url],
      });
    });

    it('should order a first_frame and last_frame into two keyframes', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        frameImages: [
          { frameType: 'last_frame', image: lastImageUrlFile },
          { frameType: 'first_frame', image: imageUrlFile },
        ],
      });

      expect(await requestBody()).toMatchObject({
        mode: 'i2v',
        keyframes: [imageUrlFile.url, lastImageUrlFile.url],
      });
    });

    it('should send inline image data as a bare base64 string', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        image: { type: 'file', mediaType: 'image/png', data: 'YWJj' },
      });

      expect(await requestBody()).toMatchObject({ keyframes: ['YWJj'] });
    });

    it('should base64-encode binary image data', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        image: {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([97, 98, 99]),
        },
      });

      expect(await requestBody()).toMatchObject({ keyframes: ['YWJj'] });
    });

    it('should drop a last_frame with no first_frame and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        frameImages: [{ frameType: 'last_frame', image: lastImageUrlFile }],
      });

      expect(await requestBody()).toStrictEqual({ mode: 't2v', prompt });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'frameImages',
        details:
          'FLUX 3 video requires a first_frame when a last_frame is provided. The last_frame was ignored.',
      });
    });

    it('should reject a video passed as the starting image and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        image: videoUrlFile,
      });

      expect(await requestBody()).toStrictEqual({ mode: 't2v', prompt });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'image',
        details:
          'FLUX 3 video does not accept a video as a keyframe. Pass it as an inputReference to continue from it instead.',
      });
    });
  });

  describe('keyframes provider option', () => {
    it('should send timed keyframe pairs', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        duration: 8,
        providerOptions: {
          blackForestLabs: {
            keyframes: [
              [0, 'https://cdn.example.com/a.png'],
              [3.5, 'https://cdn.example.com/b.png'],
            ],
          },
        },
      });

      expect(await requestBody()).toMatchObject({
        mode: 'i2v',
        keyframes: [
          [0, 'https://cdn.example.com/a.png'],
          [3.5, 'https://cdn.example.com/b.png'],
        ],
      });
    });

    it('should take precedence over top-level frame images and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        image: imageUrlFile,
        providerOptions: {
          blackForestLabs: { keyframes: ['https://cdn.example.com/a.png'] },
        },
      });

      expect(await requestBody()).toMatchObject({
        keyframes: ['https://cdn.example.com/a.png'],
      });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'image',
        details:
          'FLUX 3 video takes a single keyframe list. providerOptions.blackForestLabs.keyframes was used and the top-level frame images were ignored.',
      });
    });

    it('should reject more than 10 keyframes', async () => {
      const keyframes = Array.from(
        { length: 12 },
        (_, index) => `https://cdn.example.com/${index}.png`,
      );

      await expect(
        createModel().doGenerate({
          ...defaultOptions,
          duration: 10,
          providerOptions: { blackForestLabs: { keyframes } },
        }),
      ).rejects.toThrow('invalid blackForestLabs provider options');

      expect(server.calls).toHaveLength(0);
    });

    it.each([
      ['an empty array', []],
      [
        'mixed timed and untimed entries',
        ['https://cdn.example.com/a.png', [3, 'https://cdn.example.com/b.png']],
      ],
      [
        'out-of-order timed entries',
        [
          [3, 'https://cdn.example.com/a.png'],
          [2, 'https://cdn.example.com/b.png'],
        ],
      ],
      ['a timestamp outside the video range', [[21, 'data']]],
    ])('should reject %s', async (_name, keyframes) => {
      await expect(
        createModel().doGenerate({
          ...defaultOptions,
          providerOptions: { blackForestLabs: { keyframes } },
        }),
      ).rejects.toThrow('invalid blackForestLabs provider options');

      expect(server.calls).toHaveLength(0);
    });

    it('should reject 3 or more untimed keyframes without a duration', async () => {
      await expect(
        createModel().doGenerate({
          ...defaultOptions,
          providerOptions: {
            blackForestLabs: {
              keyframes: [
                'https://cdn.example.com/a.png',
                'https://cdn.example.com/b.png',
                'https://cdn.example.com/c.png',
              ],
            },
          },
        }),
      ).rejects.toThrow(
        'FLUX 3 video requires an explicit duration when 3 or more keyframes are sent without a timestamp.',
      );

      expect(server.calls).toHaveLength(0);
    });

    it('should not warn about duration when the keyframes are timed', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: {
          blackForestLabs: {
            keyframes: [
              [0, 'https://cdn.example.com/a.png'],
              [2, 'https://cdn.example.com/b.png'],
              [4, 'https://cdn.example.com/c.png'],
            ],
          },
        },
      });

      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe('draft', () => {
    it('should request a draft preview', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: { blackForestLabs: { draft: true } },
      });

      expect(await requestBody()).toStrictEqual({
        mode: 't2v',
        prompt,
        draft: true,
      });
    });

    it('should send draft when it is explicitly disabled', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: { blackForestLabs: { draft: false } },
      });

      expect(await requestBody()).toMatchObject({ draft: false });
    });

    it('should omit draft when unset', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      expect(await requestBody()).not.toHaveProperty('draft');
    });

    it('should report the draft_cache download URL in providerMetadata', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: {
          status: 'Ready',
          result: {
            sample: VIDEO_URL,
            draft_cache: 'https://api.example.com/draft/bundle.bin',
          },
        },
      };

      const result = await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: { blackForestLabs: { draft: true } },
      });

      expect(result.providerMetadata?.blackForestLabs?.videos).toStrictEqual([
        {
          id: REQUEST_ID,
          videoUrl: VIDEO_URL,
          draftCache: 'https://api.example.com/draft/bundle.bin',
          cost: 0.42,
          inputMegapixels: 1.23,
          outputMegapixels: 4.56,
        },
      ]);
    });

    it('should omit draftCache when the result has none', async () => {
      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(
        result.providerMetadata?.blackForestLabs?.videos,
      ).not.toHaveProperty('0.draftCache');
    });
  });

  describe('draft enhance', () => {
    it('should replay a bundle with only mode and draft_cache', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        providerOptions: { blackForestLabs: { draftCache: 'YmluYXJ5' } },
      });

      expect(await requestBody()).toStrictEqual({
        mode: 'draft_enhance',
        draft_cache: 'YmluYXJ5',
      });
    });

    it('should accept the draft_cache download URL as the bundle', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        providerOptions: {
          blackForestLabs: {
            draftCache: 'https://api.example.com/draft/bundle.bin',
          },
        },
      });

      expect(await requestBody()).toMatchObject({
        draft_cache: 'https://api.example.com/draft/bundle.bin',
      });
    });

    it('should keep safetyTolerance, the one field enhance still honors', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        providerOptions: {
          blackForestLabs: { draftCache: 'YmluYXJ5', safetyTolerance: 1 },
        },
      });

      expect(await requestBody()).toStrictEqual({
        mode: 'draft_enhance',
        draft_cache: 'YmluYXJ5',
        safety_tolerance: 1,
      });
    });

    it('should not warn when only the required empty prompt is passed', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        providerOptions: { blackForestLabs: { draftCache: 'YmluYXJ5' } },
      });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should warn that a prompt carrying text is pinned in the bundle', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: { blackForestLabs: { draftCache: 'YmluYXJ5' } },
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'prompt',
          details:
            'FLUX 3 draft enhance replays the draft bundle as it was generated, so "prompt" was ignored. ' +
            'Set it on the original draft request instead.',
        },
      ]);
    });

    it('should warn about every generation option the bundle pins', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        aspectRatio: '16:9',
        resolution: '1920x1080',
        duration: 10,
        fps: 24,
        seed: 5,
        generateAudio: true,
        image: imageUrlFile,
        inputReferences: [videoUrlFile],
        providerOptions: {
          blackForestLabs: {
            draftCache: 'YmluYXJ5',
            version: 'latest',
            keyframes: ['https://cdn.example.com/a.png'],
          },
        },
      });

      // Still a bare replay: none of the above reaches the API.
      expect(await requestBody()).toStrictEqual({
        mode: 'draft_enhance',
        draft_cache: 'YmluYXJ5',
      });
      const features = result.warnings.map(warning =>
        'feature' in warning ? warning.feature : warning.type,
      );
      // `prompt` is empty here, so it is the one pinned field not reported.
      expect(features).toStrictEqual([
        'aspectRatio',
        'resolution',
        'duration',
        'fps',
        'seed',
        'generateAudio',
        'image',
        'inputReferences',
        'keyframes',
        'version',
      ]);
    });

    it('should warn that draft is meaningless while enhancing', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        providerOptions: {
          blackForestLabs: { draftCache: 'YmluYXJ5', draft: true },
        },
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'draft',
          details:
            'FLUX 3 draft enhance always renders at full quality. The draft option was ignored.',
        },
      ]);
    });

    it('should warn about n above 1', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        n: 3,
        providerOptions: { blackForestLabs: { draftCache: 'YmluYXJ5' } },
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'n',
          details:
            'FLUX 3 video generates a single video per call. Only 1 video will be generated.',
        },
      ]);
    });

    it('should return the full-quality video from the replay', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        prompt: '',
        providerOptions: { blackForestLabs: { draftCache: 'YmluYXJ5' } },
      });

      expect(result.videos).toStrictEqual([
        { type: 'url', url: VIDEO_URL, mediaType: 'video/mp4' },
      ]);
    });
  });

  describe('video continuation', () => {
    it('should continue from a video reference', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        inputReferences: [videoUrlFile],
      });

      expect(await requestBody()).toStrictEqual({
        mode: 'v2v',
        prompt,
        start_video: videoUrlFile.url,
      });
    });

    it('should use only the first video reference and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        inputReferences: [
          videoUrlFile,
          {
            type: 'url',
            url: 'https://cdn.example.com/second.mp4',
            mediaType: 'video/mp4',
          },
        ],
      });

      expect(await requestBody()).toMatchObject({
        start_video: videoUrlFile.url,
      });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'FLUX 3 video continues from a single video. Only the first video reference was used.',
      });
    });

    it('should ignore an image reference and point at the keyframe inputs', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        inputReferences: [imageUrlFile],
      });

      expect(await requestBody()).toStrictEqual({ mode: 't2v', prompt });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'FLUX 3 video has no reference-image input. Pass images as `image`, `frameImages`, or ' +
          'providerOptions.blackForestLabs.keyframes instead. The reference was ignored.',
      });
    });

    it('should treat a reference without a mediaType as the video to continue from', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        inputReferences: [
          { type: 'url', url: 'https://cdn.example.com/untyped' },
        ],
      });

      expect(await requestBody()).toMatchObject({
        mode: 'v2v',
        start_video: 'https://cdn.example.com/untyped',
      });
      expect(result.warnings).toContainEqual({
        type: 'compatibility',
        feature: 'inputReferences',
        details:
          'FLUX 3 video only accepts a video reference, so the reference with no mediaType was treated as ' +
          'the video to continue from. Pass { url, mediaType: "video/mp4" } to be explicit.',
      });
    });

    it('should ignore a reference that is neither an image nor a video and warn', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        inputReferences: [
          {
            type: 'url',
            url: 'https://cdn.example.com/voice.mp3',
            mediaType: 'audio/mpeg',
          },
        ],
      });

      expect(await requestBody()).toStrictEqual({ mode: 't2v', prompt });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'FLUX 3 video only accepts a video reference; the "audio/mpeg" reference was ignored.',
      });
    });

    it('should keep keyframes and drop a video reference when both are given', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        image: imageUrlFile,
        inputReferences: [videoUrlFile],
      });

      expect(await requestBody()).toStrictEqual({
        mode: 'i2v',
        prompt,
        keyframes: [imageUrlFile.url],
      });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'FLUX 3 video cannot combine keyframes with a video to continue from. The video reference was ignored.',
      });
    });
  });

  describe('provider options', () => {
    it('should map safetyTolerance and version into the request', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: {
          blackForestLabs: { safetyTolerance: 0, version: 'latest' },
        },
      });

      expect(await requestBody()).toMatchObject({
        safety_tolerance: 0,
        version: 'latest',
      });
    });

    it('should reject an unavailable version', async () => {
      await expect(
        createModel().doGenerate({
          ...defaultOptions,
          providerOptions: {
            blackForestLabs: { version: '2026-08-01' },
          },
        }),
      ).rejects.toThrow('invalid blackForestLabs provider options');

      expect(server.calls).toHaveLength(0);
    });
  });

  describe('unsupported call options', () => {
    it('should warn about fps, seed, and n', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        fps: 30,
        seed: 42,
        n: 2,
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'fps',
          details: 'FLUX 3 video does not support a custom frame rate.',
        },
        {
          type: 'unsupported',
          feature: 'seed',
          details: 'FLUX 3 video does not accept a seed.',
        },
        {
          type: 'unsupported',
          feature: 'n',
          details:
            'FLUX 3 video generates a single video per call. Only 1 video will be generated.',
        },
      ]);
    });
  });

  describe('polling', () => {
    it('should expose a serializable operation from doStart', async () => {
      const result = await createModel().doStart({ ...defaultOptions });

      expect(result.operation).toStrictEqual({
        requestId: REQUEST_ID,
        pollingUrl: POLL_URL,
        cost: 0.42,
        inputMegapixels: 1.23,
        outputMegapixels: 4.56,
      });
      expect(result.warnings).toStrictEqual([]);
      expect(server.calls).toHaveLength(1);
    });

    it('should return pending from a single doStatus check', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { status: 'Generating' },
      };

      const result = await createModel().doStatus({
        operation: { requestId: REQUEST_ID, pollingUrl: POLL_URL },
      });

      expect(result).toMatchObject({ status: 'pending' });
      expect(server.calls).toHaveLength(1);
      expect(server.calls[0].requestUrl).toBe(`${POLL_URL}?id=${REQUEST_ID}`);
    });

    it('should return a completed video from doStatus', async () => {
      const result = await createModel().doStatus({
        operation: {
          requestId: REQUEST_ID,
          pollingUrl: POLL_URL,
          cost: 0.42,
          inputMegapixels: 1.23,
          outputMegapixels: 4.56,
        },
      });

      expect(result).toMatchObject({
        status: 'completed',
        videos: [{ type: 'url', url: VIDEO_URL, mediaType: 'video/mp4' }],
        providerMetadata: {
          blackForestLabs: {
            videos: [
              {
                id: REQUEST_ID,
                videoUrl: VIDEO_URL,
                seed: 7,
                duration: 8,
                cost: 0.42,
                inputMegapixels: 1.23,
                outputMegapixels: 4.56,
              },
            ],
          },
        },
      });
      expect(server.calls).toHaveLength(1);
    });

    // A resumed operation carries whatever the submit response estimated,
    // which may be stale or absent by the time the video is ready.
    it('should prefer the settled cost over the cost carried on the operation', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { ...readyResponse, cost: 0.85 },
      };

      const result = await createModel().doStatus({
        operation: {
          requestId: REQUEST_ID,
          pollingUrl: POLL_URL,
          cost: 0.42,
        },
      });

      expect(result).toMatchObject({
        status: 'completed',
        providerMetadata: {
          blackForestLabs: { videos: [{ cost: 0.85 }] },
        },
      });
    });

    it('should return an error from doStatus for terminal failures', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { status: 'Content Moderated', details: 'blocked by policy' },
      };

      const result = await createModel().doStatus({
        operation: { requestId: REQUEST_ID, pollingUrl: POLL_URL },
      });

      expect(result).toMatchObject({
        status: 'error',
        error:
          'Black Forest Labs video generation failed with status "Content Moderated": blocked by policy. Request id: req-123',
      });
      expect(server.calls).toHaveLength(1);
    });

    it('should keep polling through non-terminal statuses', async () => {
      let callNumber = 0;
      server.urls[POLL_URL].response = () => {
        callNumber++;
        if (callNumber < 3) {
          return {
            type: 'json-value',
            body: { status: callNumber === 1 ? 'Pending' : 'Generating' },
          };
        }
        return { type: 'json-value', body: readyResponse };
      };

      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(callNumber).toBe(3);
      expect(result.videos[0]).toMatchObject({ url: VIDEO_URL });
    });

    it('should append the request id to a polling URL that lacks one', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      expect(server.calls[1].requestUrl).toBe(`${POLL_URL}?id=${REQUEST_ID}`);
    });

    it('should throw on a moderated result', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { status: 'Content Moderated', details: 'blocked by policy' },
      };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(
        'Black Forest Labs video generation failed with status "Content Moderated": blocked by policy. Request id: req-123',
      );
    });

    it('should throw when the job errors', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { status: 'Error' },
      };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(
        'Black Forest Labs video generation failed with status "Error". Request id: req-123',
      );
    });

    it('should accept `state` in place of `status`', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { state: 'Ready', result: { sample: VIDEO_URL } },
      };

      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.videos[0]).toMatchObject({ url: VIDEO_URL });
    });

    it('should throw when Ready arrives without a sample URL', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { status: 'Ready', result: {} },
      };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(
        'Black Forest Labs reported the video as Ready but returned no result.sample URL. Request id: req-123',
      );
    });

    it('should time out while the job is still running', async () => {
      server.urls[POLL_URL].response = {
        type: 'json-value',
        body: { status: 'Generating' },
      };

      await expect(
        createModel({
          pollIntervalMillis: 10,
          pollTimeoutMillis: 25,
        }).doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(
        'Black Forest Labs video generation timed out after 25ms. Request id: req-123',
      );
    });
  });

  describe('response metadata', () => {
    it('should report the model id and timestamp', async () => {
      const currentDate = new Date('2026-01-01T00:00:00Z');

      const result = await createModel({
        currentDate: () => currentDate,
      }).doGenerate({ ...defaultOptions });

      expect(result.response.modelId).toBe('flux-3-video');
      expect(result.response.timestamp).toStrictEqual(currentDate);
    });
  });
});
