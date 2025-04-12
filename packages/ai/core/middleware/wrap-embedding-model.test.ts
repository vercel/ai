import { EmbeddingModelV2CallOptions } from '@ai-sdk/provider';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { wrapEmbeddingModel } from './wrap-embedding-model';

describe('wrapEmbeddingModel', () => {
  it('should pass through model properties', () => {
    const wrappedModel = wrapEmbeddingModel({
      model: new MockEmbeddingModelV2({
        provider: 'test-provider',
        modelId: 'test-model',
        maxEmbeddingsPerCall: 10,
        supportsParallelCalls: true,
      }),
      middleware: {
        middlewareVersion: 'v2',
      },
    });

    expect(wrappedModel.provider).toBe('test-provider');
    expect(wrappedModel.modelId).toBe('test-model');
    expect(wrappedModel.maxEmbeddingsPerCall).toBe(10);
    expect(wrappedModel.supportsParallelCalls).toBe(true);
  });

  it('should override provider and modelId if provided', () => {
    const wrappedModel = wrapEmbeddingModel({
      model: new MockEmbeddingModelV2(),
      middleware: {
        middlewareVersion: 'v2',
      },
      providerId: 'override-provider',
      modelId: 'override-model',
    });

    expect(wrappedModel.provider).toBe('override-provider');
    expect(wrappedModel.modelId).toBe('override-model');
  });

  it('should call transformParams middleware for doEmbed', async () => {
    const mockModel = new MockEmbeddingModelV2({
      doEmbed: vi.fn().mockResolvedValue('mock result'),
    });
    const transformParams = vi.fn().mockImplementation(({ params }) => ({
      ...params,
      transformed: true,
    }));

    const wrappedModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v2',
        transformParams,
      },
    });

    const params: EmbeddingModelV2CallOptions<string> = {
      values: ['Hello'],
    };

    await wrappedModel.doEmbed(params);

    expect(transformParams).toHaveBeenCalledWith({
      params,
    });

    expect(mockModel.doEmbed).toHaveBeenCalledWith({
      ...params,
      transformed: true,
    });
  });

  it('should call wrapEmbed middleware', async () => {
    const mockModel = new MockEmbeddingModelV2({
      doEmbed: vi.fn().mockResolvedValue('mock result'),
    });
    const wrapEmbed = vi.fn().mockImplementation(({ doEmbed }) => doEmbed());

    const wrappedModel = wrapEmbeddingModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v2',
        wrapEmbed,
      },
    });

    const params: EmbeddingModelV2CallOptions<string> = {
      values: ['Hello'],
    };

    await wrappedModel.doEmbed(params);

    expect(wrapEmbed).toHaveBeenCalledWith({
      doEmbed: expect.any(Function),
      params,
      model: mockModel,
    });
  });

  describe('wrapEmbeddingModel with multiple middlewares', () => {
    it('should call multiple transformParams middlewares in sequence for doEmbed', async () => {
      const mockModel = new MockEmbeddingModelV2({
        doEmbed: vi.fn().mockResolvedValue('final result'),
      });

      const transformParams1 = vi.fn().mockImplementation(({ params }) => ({
        ...params,
        transformationStep1: true,
      }));
      const transformParams2 = vi.fn().mockImplementation(({ params }) => ({
        ...params,
        transformationStep2: true,
      }));

      const wrappedModel = wrapEmbeddingModel({
        model: mockModel,
        middleware: [
          {
            middlewareVersion: 'v2',
            transformParams: transformParams1,
          },
          {
            middlewareVersion: 'v2',
            transformParams: transformParams2,
          },
        ],
      });

      const params: EmbeddingModelV2CallOptions<string> = {
        values: ['Hello'],
      };

      await wrappedModel.doEmbed(params);

      expect(transformParams1).toHaveBeenCalledWith({
        params,
      });

      expect(transformParams2).toHaveBeenCalledWith({
        params: { ...params, transformationStep1: true },
      });

      expect(mockModel.doEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should chain multiple wrapEmbed middlewares in the correct order', async () => {
      const mockModel = new MockEmbeddingModelV2({
        doEmbed: vi.fn().mockResolvedValue('final embed result'),
      });

      const wrapEmbed1 = vi
        .fn()
        .mockImplementation(async ({ doEmbed, params, model }) => {
          const result = await doEmbed();
          return `wrapEmbed1(${result})`;
        });
      const wrapEmbed2 = vi
        .fn()
        .mockImplementation(async ({ doEmbed, params, model }) => {
          const result = await doEmbed();
          return `wrapEmbed2(${result})`;
        });

      const wrappedModel = wrapEmbeddingModel({
        model: mockModel,
        middleware: [
          {
            middlewareVersion: 'v2',
            wrapEmbed: wrapEmbed1,
          },
          {
            middlewareVersion: 'v2',
            wrapEmbed: wrapEmbed2,
          },
        ],
      });

      const params: EmbeddingModelV2CallOptions<string> = {
        values: ['Hello'],
      };

      const result = await wrappedModel.doEmbed(params);

      // The middlewares should wrap in order, applying wrapEmbed2 last
      expect(result).toBe('wrapEmbed1(wrapEmbed2(final embed result))');
      expect(wrapEmbed1).toHaveBeenCalled();
      expect(wrapEmbed2).toHaveBeenCalled();
    });
  });
});
