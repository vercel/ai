import type { BatchV4RequestBase } from '../../batch/v4/batch-v4-request';
import type { LanguageModelV4CallOptions } from './language-model-v4-call-options';

/**
 * A normalized language model call within a batch.
 */
export type LanguageModelV4BatchRequest<ModelId extends string = string> =
  BatchV4RequestBase<ModelId> & {
    readonly type: 'text';
    readonly options: Pick<
      LanguageModelV4CallOptions,
      | 'prompt'
      | 'maxOutputTokens'
      | 'temperature'
      | 'stopSequences'
      | 'topP'
      | 'topK'
      | 'presencePenalty'
      | 'frequencyPenalty'
      | 'seed'
      | 'reasoning'
      | 'responseFormat'
      | 'toolChoice'
      | 'tools'
      | 'providerOptions'
    >;
  };
