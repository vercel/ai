import type { CartesiaModelIds } from './cartesia-model-catalog';
export type CartesiaRealtimeModelId =
  | CartesiaModelIds['realtime']
  | (string & {});

export type CartesiaRealtimeModelOptions = Record<string, never>;
