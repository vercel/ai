import type { GradiumClientOptions } from '@gradium/sdk';

export interface GradiumConfig {
  provider: string;
  baseURL: string;
  // Keep credentials out of workflow serialization.
  apiKey?: () => string;
  token?: () => string | undefined;
  fetch?: GradiumClientOptions['fetch'];
  webSocketFactory?: GradiumClientOptions['webSocketFactory'];
  ttsRoute?: string;
  sttRoute?: string;
}
