import { describe, it, expect } from 'vitest';
import { createFal } from './fal-provider';
import { FalImageModel } from './fal-image-model';

describe('createFal', () => {
  it('creates a provider with required settings', () => {
    const provider = createFal({ apiKey: 'test-token' });
    expect(provider.image).toBeDefined();
  });

  it('creates a provider with custom settings', () => {
    const provider = createFal({
      apiKey: 'test-token',
      baseURL: 'https://custom.fal.ai',
    });
    expect(provider.image).toBeDefined();
  });

  it('creates an image model instance', () => {
    const provider = createFal({ apiKey: 'test-token' });
    const model = provider.image('fal-ai/flux/dev');
    expect(model).toBeInstanceOf(FalImageModel);
  });
});
