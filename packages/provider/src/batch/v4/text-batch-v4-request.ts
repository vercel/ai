import type { LanguageModelV4CallOptions } from '../../language-model/v4/language-model-v4-call-options';
import type { BatchV4RequestBase } from './batch-v4-request';

/**
 * A normalized text generation request within a batch.
 */
export type TextBatchV4Request<ModelId extends string = string> =
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
