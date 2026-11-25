import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayExtractionModelId =
  | GatewayModelIds['extraction']
  | (string & {});
