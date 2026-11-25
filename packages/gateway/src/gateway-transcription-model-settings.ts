import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayTranscriptionModelId =
  | GatewayModelIds['transcription']
  | (string & {});
