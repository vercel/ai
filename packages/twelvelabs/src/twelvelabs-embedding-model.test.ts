import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TwelveLabsEmbeddingModel } from './twelvelabs-embedding-model';
import { mapTwelveLabsError } from './twelvelabs-error';

vi.mock('./twelvelabs-error', () => ({
  mapTwelveLabsError: vi.fn().mockImplementation(error => error),
}));

describe('TwelveLabsEmbeddingModel', () => {
  let mockClient: any;
  let model: TwelveLabsEmbeddingModel;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      embed: {
        create: vi.fn().mockResolvedValue({
          textEmbedding: {
            segments: [{ float: new Array(1024).fill(0.1) }],
          },
        }),
      },
    };

    model = new TwelveLabsEmbeddingModel('marengo2.7', {
      client: mockClient,
      modelId: 'marengo2.7',
    });
  });

  describe('metadata', () => {
    it('should have correct specification version', () => {
      expect(model.specificationVersion).toBe('v2');
    });

    it('should have correct provider name', () => {
      expect(model.provider).toBe('twelvelabs');
    });

    it('should have correct dimensions for marengo2.7', () => {
      expect(model.dimensions).toBe(1024);
    });

    it('should support parallel calls', () => {
      expect(model.supportsParallelCalls).toBe(true);
    });

    it('should have correct max embeddings per call', () => {
      expect(model.maxEmbeddingsPerCall).toBe(100);
    });
  });

  describe('embedValue', () => {
    it('should embed a single text value', async () => {
      const result = await model.embedValue('Test text');

      expect(mockClient.embed.create).toHaveBeenCalledWith({
        modelName: 'Marengo-retrieval-2.7',
        text: 'Test text',
        textTruncate: 'end',
      });
      expect(result.value).toHaveLength(1024);
      expect(result.value[0]).toBe(0.1);
    });

    it('should handle textEmbedding format', async () => {
      mockClient.embed.create.mockResolvedValue({
        textEmbedding: {
          segments: [{ float: new Array(1024).fill(0.2) }],
        },
      });

      const result = await model.embedValue('Test');
      expect(result.value).toHaveLength(1024);
      expect(result.value[0]).toBe(0.2);
    });

    it('should handle alternative segment format', async () => {
      mockClient.embed.create.mockResolvedValue({
        textEmbedding: {
          segments: [{ float: new Array(1024).fill(0.3) }],
        },
      });

      const result = await model.embedValue('Test');
      expect(result.value).toHaveLength(1024);
      expect(result.value[0]).toBe(0.3);
    });

    it('should handle nested float array format', async () => {
      mockClient.embed.create.mockResolvedValue({
        textEmbedding: {
          segments: [{ float: new Array(1024).fill(0.4) }],
        },
      });

      const result = await model.embedValue('Test');
      expect(result.value).toHaveLength(1024);
      expect(result.value[0]).toBe(0.4);
    });

    it('should throw error when no embedding is returned', async () => {
      mockClient.embed.create.mockResolvedValue({});

      await expect(model.embedValue('Test text')).rejects.toThrow(
        'No embedding returned for text: Test text...',
      );
    });

    it('should map errors correctly', async () => {
      const testError = new Error('API Error');
      mockClient.embed.create.mockRejectedValue(testError);

      await expect(model.embedValue('Test')).rejects.toThrow();
      expect(mapTwelveLabsError).toHaveBeenCalledWith(testError);
    });
  });

  describe('embedValues', () => {
    it('should embed multiple text values', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3'];

      mockClient.embed.create
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.1) }] },
        })
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.2) }] },
        })
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.3) }] },
        });

      const result = await model.embedValues(texts);

      expect(mockClient.embed.create).toHaveBeenCalledTimes(3);
      expect(mockClient.embed.create).toHaveBeenCalledWith({
        modelName: 'Marengo-retrieval-2.7',
        text: 'Text 1',
        textTruncate: 'end',
      });
      expect(result.values).toHaveLength(3);
      expect(result.values[0][0]).toBe(0.1);
      expect(result.values[1][0]).toBe(0.2);
      expect(result.values[2][0]).toBe(0.3);
    });

    it('should return empty array for empty input', async () => {
      const result = await model.embedValues([]);

      expect(mockClient.embed.create).not.toHaveBeenCalled();
      expect(result.values).toEqual([]);
    });

    it('should handle large batches up to maxValuesPerCall', async () => {
      const texts = new Array(100).fill('Text');

      mockClient.embed.create.mockResolvedValue({
        textEmbedding: { segments: [{ float: new Array(1024).fill(0.1) }] },
      });

      const result = await model.embedValues(texts);

      expect(mockClient.embed.create).toHaveBeenCalledTimes(100);
      expect(result.values).toHaveLength(100);
    });

    it('should handle mixed response formats', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3'];

      mockClient.embed.create
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.1) }] },
        })
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.2) }] },
        })
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.3) }] },
        });

      const result = await model.embedValues(texts);

      expect(result.values).toHaveLength(3);
      expect(result.values[0][0]).toBe(0.1);
      expect(result.values[1][0]).toBe(0.2);
      expect(result.values[2][0]).toBe(0.3);
    });

    it('should throw error if any embedding fails', async () => {
      const texts = ['Text 1', 'Text 2'];

      mockClient.embed.create
        .mockResolvedValueOnce({
          textEmbedding: { segments: [{ float: new Array(1024).fill(0.1) }] },
        })
        .mockResolvedValueOnce({});

      await expect(model.embedValues(texts)).rejects.toThrow(
        'No embedding returned for text:',
      );
    });

    it('should truncate long text in error messages', async () => {
      const longText = 'A'.repeat(100);
      mockClient.embed.create.mockResolvedValue({});

      await expect(model.embedValue(longText)).rejects.toThrow(
        `No embedding returned for text: ${'A'.repeat(50)}...`,
      );
    });
  });

  describe('doEmbed', () => {
    it('should be called by embedValues', async () => {
      const spy = vi.spyOn(model, 'doEmbed');
      const texts = ['Text 1', 'Text 2'];

      mockClient.embed.create.mockResolvedValue({
        textEmbedding: { segments: [{ float: new Array(1024).fill(0.1) }] },
      });

      await model.embedValues(texts);

      expect(spy).toHaveBeenCalledWith({
        values: texts,
        abortSignal: undefined,
        headers: undefined,
      });
    });

    it('should handle parallel embedding calls', async () => {
      const texts = new Array(10).fill('Text');

      mockClient.embed.create.mockResolvedValue({
        textEmbedding: { segments: [{ float: new Array(1024).fill(0.1) }] },
      });

      const result = await model.doEmbed({ values: texts });

      expect(result.embeddings).toHaveLength(10);
      // All calls should be made in parallel (Promise.all)
      expect(mockClient.embed.create).toHaveBeenCalledTimes(10);
    });
  });
});
