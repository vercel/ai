import { expectTypeOf } from 'vitest';
import type { GatewayEmbeddingModelId, GatewayImageModelId } from '.';
import type { GatewayEmbeddingModelId as DefinedGatewayEmbeddingModelId } from './gateway-embedding-model-settings';
import type { GatewayImageModelId as DefinedGatewayImageModelId } from './gateway-image-model-settings';

expectTypeOf<GatewayEmbeddingModelId>().toEqualTypeOf<DefinedGatewayEmbeddingModelId>();
expectTypeOf<GatewayImageModelId>().toEqualTypeOf<DefinedGatewayImageModelId>();
