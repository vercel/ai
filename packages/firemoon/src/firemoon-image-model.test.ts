import { describe, it, expect, vi } from 'vitest';
import { FiremoonImageModel } from './firemoon-image-model';

describe('FiremoonImageModel', () => {
  it('has correct specification version', () => {
    const model = new FiremoonImageModel('flux/dev', {
      provider: 'firemoon',
      baseURL: 'https://firemoon.studio/api',
    });
    expect(model.specificationVersion).toBe('v3');
  });

  it('has correct max images per call', () => {
    const model = new FiremoonImageModel('flux/dev', {
      provider: 'firemoon',
      baseURL: 'https://firemoon.studio/api',
    });
    expect(model.maxImagesPerCall).toBe(4);
  });

  it('has correct provider name', () => {
    const model = new FiremoonImageModel('flux/dev', {
      provider: 'firemoon',
      baseURL: 'https://firemoon.studio/api',
    });
    expect(model.provider).toBe('firemoon');
  });

  it('stores model id correctly', () => {
    const model = new FiremoonImageModel('flux/dev', {
      provider: 'firemoon',
      baseURL: 'https://firemoon.studio/api',
    });
    expect(model.modelId).toBe('flux/dev');
  });
});
