import { describe, it, expect } from 'vitest';
import { createReplicate } from './replicate-provider';
import { ReplicateImageModel } from './replicate-image-model';

describe('createReplicate', () => {
  it('creates a provider with required settings', () => {
    const provider = createReplicate({ apiToken: 'test-token' });
    expect(provider.image).toBeDefined();
  });

  it('creates a provider with custom settings', () => {
    const provider = createReplicate({
      apiToken: 'test-token',
      baseURL: 'https://custom.replicate.com',
    });
    expect(provider.image).toBeDefined();
  });

  it('creates an image model instance', () => {
    const provider = createReplicate({ apiToken: 'test-token' });
    const model = provider.image('stability-ai/sdxl:abc123');
    expect(model).toBeInstanceOf(ReplicateImageModel);
  });

  it('passes configuration to image model', () => {
    const customConfig = {
      apiToken: 'test-token',
      baseURL: 'https://custom.replicate.com',
    };
    const provider = createReplicate(customConfig);
    const model = provider.image('stability-ai/sdxl:abc123');
    
    // Access internal config to verify it was passed correctly
    const modelConfig = (model as { config: typeof customConfig & { provider: string } }).config;
    expect(modelConfig).toMatchObject({
      ...customConfig,
      provider: 'replicate',
    });
  });
}); 