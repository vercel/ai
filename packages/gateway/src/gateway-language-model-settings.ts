import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayModelId = GatewayModelIds['language'] | (string & {});
