import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayRealtimeModelId =
  | GatewayModelIds['realtime']
  | (string & {});
