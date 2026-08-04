import { expectTypeOf, it } from 'vitest';
import type { GatewayEmbeddingModelId, GatewayImageModelId } from './index';

it('exports embedding and image model ID types', () => {
  expectTypeOf<GatewayEmbeddingModelId>().toMatchTypeOf<string>();
  expectTypeOf<GatewayImageModelId>().toMatchTypeOf<string>();
});
