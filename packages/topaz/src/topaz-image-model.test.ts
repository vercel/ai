import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { TopazImageModel } from './topaz-image-model';

const TEST_BASE_URL = 'https://api.topazlabs.com';
const PROCESS_ID = 'proc-123';
const DOWNLOAD_URL = 'https://cdn.topazlabs.example.com/out.png';

const outputBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);

const inputImage = {
  type: 'file' as const,
  mediaType: 'image/png',
  data: new Uint8Array([1, 2, 3, 4]),
};

const defaultOptions = {
  prompt: undefined,
  n: 1,
  size: undefined,
  aspectRatio: undefined,
  seed: undefined,
  files: [inputImage],
  mask: undefined,
  providerOptions: { topaz: { pollIntervalMillis: 1 } },
} as const;

function createModel(modelId = 'wonder-3.5') {
  return new TopazImageModel(modelId, {
    provider: 'topaz.image',
    baseURL: TEST_BASE_URL,
    headers: () => ({ 'X-API-Key': 'test-key' }),
    _internal: { currentDate: () => new Date('2026-01-01T00:00:00Z') },
  });
}

describe('TopazImageModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/image/v1/enhance-gen/async`]: {
      response: {
        type: 'json-value',
        body: { process_id: PROCESS_ID, source_id: 'src-1', eta: 5 },
      },
    },
    [`${TEST_BASE_URL}/image/v1/status/${PROCESS_ID}`]: {
      response: {
        type: 'json-value',
        body: {
          status: 'Completed',
          progress: 100,
          credits: 2,
          output_width: 4000,
          output_height: 3000,
          output_format: 'png',
        },
      },
    },
    [`${TEST_BASE_URL}/image/v1/download/${PROCESS_ID}`]: {
      response: {
        type: 'json-value',
        body: { download_url: DOWNLOAD_URL, expiry: 3600 },
      },
    },
    [DOWNLOAD_URL]: {
      response: { type: 'binary', body: outputBytes },
    },
  });

  describe('constructor', () => {
    it('exposes provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('topaz.image');
      expect(model.modelId).toBe('wonder-3.5');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });

  describe('doGenerate', () => {
    it('submits, polls, downloads and returns the enhanced image', async () => {
      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.images).toHaveLength(1);
      expect(new Uint8Array(result.images[0] as Uint8Array)).toEqual(
        new Uint8Array(outputBytes),
      );
      expect(result.warnings).toEqual([]);
      expect(result.response.modelId).toBe('wonder-3.5');
      expect(result.response.timestamp).toEqual(
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(result.providerMetadata?.topaz.images).toEqual([
        {
          processId: PROCESS_ID,
          credits: 2,
          width: 4000,
          height: 3000,
          format: 'png',
        },
      ]);
    });

    it('maps the model id onto the Topaz model name and uploads the file', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      const body = await server.calls[0].requestBodyMultipart;

      expect(body?.model).toBe('Wonder 3.5');
      expect(body?.image).toBeInstanceOf(File);
    });

    it('sends the API key on the Topaz endpoints', async () => {
      await createModel().doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestHeaders['x-api-key']).toBe('test-key');
    });

    it('derives output dimensions from the size option', async () => {
      await createModel().doGenerate({ ...defaultOptions, size: '4000x3000' });

      const body = await server.calls[0].requestBodyMultipart;

      expect(body?.output_width).toBe('4000');
      expect(body?.output_height).toBe('3000');
    });

    it('prefers explicit output dimensions over the size option', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        size: '4000x3000',
        providerOptions: {
          topaz: {
            pollIntervalMillis: 1,
            outputWidth: 8000,
            outputHeight: 6000,
          },
        },
      });

      const body = await server.calls[0].requestBodyMultipart;

      expect(body?.output_width).toBe('8000');
      expect(body?.output_height).toBe('6000');
    });

    it('sends schema fields in snake_case and model settings in camelCase', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        providerOptions: {
          topaz: {
            pollIntervalMillis: 1,
            outputFormat: 'jpeg',
            cropToFill: true,
            enhancementStrength: 'medium',
            grain: true,
            grainDensity: 0.25,
            grainModel: 'gaussian',
            grainSize: 2,
            grainStrength: 0.75,
            inputWidth: 1000,
            inputHeight: 800,
          },
        },
      });

      const body = await server.calls[0].requestBodyMultipart;

      expect(body?.output_format).toBe('jpeg');
      expect(body?.crop_to_fill).toBe('true');
      expect(body?.enhancementStrength).toBe('medium');
      expect(body?.grain).toBe('true');
      expect(body?.grainDensity).toBe('0.25');
      expect(body?.grainModel).toBe('gaussian');
      expect(body?.grainSize).toBe('2');
      expect(body?.grainStrength).toBe('0.75');
      expect(body?.inputWidth).toBe('1000');
      expect(body?.inputHeight).toBe('800');
    });

    it('passes a URL input through as source_url instead of uploading bytes', async () => {
      await createModel().doGenerate({
        ...defaultOptions,
        files: [{ type: 'url', url: 'https://example.com/input.png' }],
      });

      const body = await server.calls[0].requestBodyMultipart;

      expect(body?.source_url).toBe('https://example.com/input.png');
      expect(body?.image).toBeUndefined();
    });

    it('polls until the job completes', async () => {
      const statuses = ['Pending', 'Processing', 'Completed'];
      let statusCalls = 0;

      server.urls[`${TEST_BASE_URL}/image/v1/status/${PROCESS_ID}`].response =
        () => ({
          type: 'json-value',
          body: { status: statuses[statusCalls++] ?? 'Completed' },
        });

      const result = await createModel().doGenerate({ ...defaultOptions });

      expect(result.images).toHaveLength(1);
      expect(statusCalls).toBe(3);
    });

    it('warns about options Topaz does not support', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        prompt: 'make it pretty',
        aspectRatio: '16:9',
        seed: 42,
        n: 2,
        mask: inputImage,
      });

      expect(result.warnings.map(warning => warning.feature)).toEqual([
        'prompt',
        'aspectRatio',
        'seed',
        'mask',
        'n',
      ]);
    });

    it('warns when more than one input file is passed', async () => {
      const result = await createModel().doGenerate({
        ...defaultOptions,
        files: [inputImage, inputImage],
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ feature: 'files' }),
      );
    });

    it('throws when no input image is provided', async () => {
      await expect(
        createModel().doGenerate({ ...defaultOptions, files: undefined }),
      ).rejects.toThrow(/enhance an existing image/);
    });

    it('throws when the job fails', async () => {
      server.urls[`${TEST_BASE_URL}/image/v1/status/${PROCESS_ID}`].response = {
        type: 'json-value',
        body: { status: 'Failed' },
      };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(/failed for process proc-123/);
    });

    it('throws when the job is cancelled', async () => {
      server.urls[`${TEST_BASE_URL}/image/v1/status/${PROCESS_ID}`].response = {
        type: 'json-value',
        body: { status: 'Cancelled' },
      };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(/cancelled for process proc-123/);
    });

    it('throws when polling exceeds the timeout', async () => {
      server.urls[`${TEST_BASE_URL}/image/v1/status/${PROCESS_ID}`].response = {
        type: 'json-value',
        body: { status: 'Processing' },
      };

      await expect(
        createModel().doGenerate({
          ...defaultOptions,
          providerOptions: {
            topaz: { pollIntervalMillis: 1, pollTimeoutMillis: 1 },
          },
        }),
      ).rejects.toThrow(/did not finish within 1ms/);
    });

    it('throws when no download URL is returned', async () => {
      server.urls[`${TEST_BASE_URL}/image/v1/download/${PROCESS_ID}`].response =
        {
          type: 'json-value',
          body: {},
        };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(/did not return a download URL/);
    });

    it('surfaces Topaz error details', async () => {
      server.urls[`${TEST_BASE_URL}/image/v1/enhance-gen/async`].response = {
        type: 'error',
        status: 422,
        body: JSON.stringify({ detail: [{ msg: 'model is required' }] }),
      };

      await expect(
        createModel().doGenerate({ ...defaultOptions }),
      ).rejects.toThrow(/model is required/);
    });
  });
});
