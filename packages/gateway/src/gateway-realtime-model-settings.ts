import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayRealtimeModelId =
  | GatewayModelIds['realtime']
  | (string & {});

/**
 * Realtime model IDs that use the continuous Live API by default. Other IDs use
 * the realtime API unless `{ api: 'live' }` is passed.
 */
export const gatewayLiveModelIds = [
  'openai/gpt-live-1',
  'openai/gpt-live-1.1',
] as const satisfies readonly GatewayModelIds['realtime'][];

export type GatewayKnownLiveModelId = (typeof gatewayLiveModelIds)[number];

export type GatewayRealtimeOptions = {
  /** Selects the Gateway API for the model ID, including for new Live models. */
  api?: 'live' | 'realtime';
};
