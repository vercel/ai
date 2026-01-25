import { describe, it, expect } from 'vitest';
import { ImageRouterImageModel } from './imagerouter-image-model';

describe('ImageRouterImageModel', () => {
  const model = new ImageRouterImageModel('test/test', {
    provider: 'imagerouter.image',
    baseURL: 'https://api.imagerouter.io',
    headers: async () => ({
      Authorization: 'Bearer test-key',
    }),
  });

  it('should have correct specification version', () => {
    expect(model.specificationVersion).toBe('v3');
  });

  it('should have correct provider', () => {
    expect(model.provider).toBe('imagerouter.image');
  });

  it('should have correct modelId', () => {
    expect(model.modelId).toBe('test/test');
  });

  it('should have maxImagesPerCall set to 1', () => {
    expect(model.maxImagesPerCall).toBe(1);
  });
});
