import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayDecisionModelId =
  | GatewayModelIds['decision']
  | (string & {});
