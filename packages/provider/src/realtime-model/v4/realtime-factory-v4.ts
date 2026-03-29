import { RealtimeModelV4 } from './realtime-model-v4';
import { RealtimeModelV4SessionConfig } from './realtime-model-v4-session-config';

export type RealtimeFactoryV4GetTokenOptions = {
  model: string;
  sessionConfig?: RealtimeModelV4SessionConfig;
  expiresAfterSeconds?: number;
};

export type RealtimeFactoryV4GetTokenResult = {
  token: string;
  url: string;
  expiresAt?: number;
};

export interface RealtimeFactoryV4 {
  (modelId: string): RealtimeModelV4;

  getToken(
    options: RealtimeFactoryV4GetTokenOptions,
  ): Promise<RealtimeFactoryV4GetTokenResult>;
}
