import type { RealtimeModelV4 } from './realtime-model-v4';
import type { RealtimeModelV4ClientSecretOptions } from './realtime-model-v4-client-secret';
import type { SharedV4Warning } from '../../shared';

export type RealtimeFactoryV4GetTokenOptions = {
  model: string;
} & RealtimeModelV4ClientSecretOptions;

export type RealtimeFactoryV4GetTokenResult = {
  token: string;
  url: string;
  expiresAt?: number;
  /**
   * Provider warnings produced while preparing the embedded session config.
   */
  warnings?: SharedV4Warning[];
};

export interface RealtimeFactoryV4 {
  (modelId: string): RealtimeModelV4;

  getToken(
    options: RealtimeFactoryV4GetTokenOptions,
  ): Promise<RealtimeFactoryV4GetTokenResult>;
}
