import type { BatchModelV4 } from '../../batch/v4/batch-v4';
import type { LanguageModelV4 } from './language-model-v4';
import type { LanguageModelV4CallOptions } from './language-model-v4-call-options';
import type { LanguageModelV4GenerateResult } from './language-model-v4-generate-result';

/**
 * A normalized language model call within a batch.
 */
export type LanguageModelV4BatchRequest = {
  /**
   * Application-provided identifier used to correlate the request with its
   * result.
   */
  readonly id: string;

  /**
   * Normalized language model call options for the request.
   */
  readonly options: Omit<
    LanguageModelV4CallOptions,
    'abortSignal' | 'headers' | 'includeRawChunks'
  >;
};

/**
 * Language model V4 with durable batch-processing support.
 */
export type BatchLanguageModelV4 = LanguageModelV4 &
  BatchModelV4<LanguageModelV4BatchRequest, LanguageModelV4GenerateResult>;
