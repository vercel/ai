import { describe, expectTypeOf, it } from 'vitest';
import type { GatewayEmbeddingModelId, GatewayImageModelId } from './index';

describe('Gateway model ID exports', () => {
  it('exports the embedding model ID type', () => {
    expectTypeOf<'openai/text-embedding-3-small'>().toMatchTypeOf<GatewayEmbeddingModelId>();
  });

  it('exports the image model ID type', () => {
    expectTypeOf<'openai/gpt-image-1'>().toMatchTypeOf<GatewayImageModelId>();
  });
});
