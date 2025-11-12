import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFal } from './fal-provider';
import { FalImageModel } from './fal-image-model';

vi.mock('./fal-image-model', () => ({
  FalImageModel: vi.fn(),
}));

describe('createFal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('image', () => {
    it('should construct an image model with default configuration', () => {
      const provider = createFal();
      const modelId = 'fal-ai/flux/dev';

      const model = provider.image(modelId);

      expect(model).toBeInstanceOf(FalImageModel);
      expect(FalImageModel).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'fal.image',
          baseURL: 'https://fal.run',
        }),
      );
    });

    it('should respect custom configuration options', () => {
      const customBaseURL = 'https://custom.fal.run';
      const customHeaders = { 'X-Custom-Header': 'value' };
      const mockFetch = vi.fn();

      const provider = createFal({
        apiKey: 'custom-api-key',
        baseURL: customBaseURL,
        headers: customHeaders,
        fetch: mockFetch,
      });
      const modelId = 'fal-ai/flux/dev';

      provider.image(modelId);

      expect(FalImageModel).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          baseURL: customBaseURL,
          headers: expect.any(Function),
          fetch: mockFetch,
          provider: 'fal.image',
        }),
      );
    });
  });
});
