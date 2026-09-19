import type {
  Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
  Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
} from '@ai-sdk/provider';
import type { Context, ProviderOptions } from '@ai-sdk/provider-utils';
import type { EvaluationQuestion, EvaluationResult } from './evaluation-result';

export type EvaluateStartEvent<RUNTIME_CONTEXT extends Context = Context> = {
  readonly runtimeContext: RUNTIME_CONTEXT;
  readonly callId: string;
  readonly operationId: 'ai.evaluate';
  readonly provider: string;
  readonly modelId: string;
  readonly state: EvaluationModelV4CallOptions['state'];
  readonly questions: Readonly<Record<string, EvaluationQuestion>>;
  readonly maxRetries: number;
  readonly headers: Record<string, string> | undefined;
  readonly providerOptions: ProviderOptions;
};

export type EvaluateEndEvent<RUNTIME_CONTEXT extends Context = Context> =
  EvaluateStartEvent<RUNTIME_CONTEXT> &
    Pick<
      EvaluationResult<Record<string, EvaluationQuestion>>,
      | 'answers'
      | 'usage'
      | 'warnings'
      | 'rounding'
      | 'providerMetadata'
      | 'response'
    >;

export type EvaluationModelCallStartEvent = {
  readonly callId: string;
  readonly operationId: 'ai.evaluate.doEvaluate';
  readonly provider: string;
  readonly modelId: string;
  readonly state: EvaluationModelV4CallOptions['state'];
  readonly questions: Readonly<Record<string, EvaluationQuestion>>;
};

export type EvaluationModelCallEndEvent = EvaluationModelCallStartEvent &
  Pick<
    EvaluationModelV4Result,
    | 'answers'
    | 'usage'
    | 'warnings'
    | 'rounding'
    | 'providerMetadata'
    | 'response'
  >;
