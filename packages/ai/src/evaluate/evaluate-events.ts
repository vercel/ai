import type {
  Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
  Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
} from '@ai-sdk/provider';
import type { Context, ProviderOptions } from '@ai-sdk/provider-utils';
import type { EvaluationQuestion, EvaluationResult } from './evaluation-result';

/**
 * Event passed to the `onStart` callback for evaluation operations.
 *
 * Called when the operation begins, before the evaluation model is called.
 */
export type EvaluateStartEvent<RUNTIME_CONTEXT extends Context = Context> = {
  /** User-defined runtime context. */
  readonly runtimeContext: RUNTIME_CONTEXT;

  /** Unique identifier for this evaluation call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type (`ai.evaluate`). */
  readonly operationId: 'ai.evaluate';

  /** The provider identifier. */
  readonly provider: string;

  /** The evaluation model identifier. */
  readonly modelId: string;

  /** The shared state being evaluated. */
  readonly state: EvaluationModelV4CallOptions['state'];

  /** The questions being evaluated against the shared state. */
  readonly questions: Readonly<Record<string, EvaluationQuestion>>;

  /** Maximum number of retries for the evaluation model call. */
  readonly maxRetries: number;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions;
};

/**
 * Event passed to the `onEnd` callback for evaluation operations.
 *
 * Called when the operation completes successfully.
 */
export type EvaluateEndEvent<RUNTIME_CONTEXT extends Context = Context> =
  EvaluateStartEvent<RUNTIME_CONTEXT> & {
    /** Exactly one typed answer per question ID. */
    readonly answers: EvaluationResult<
      Record<string, EvaluationQuestion>
    >['answers'];

    /** Token usage for the evaluation operation. */
    readonly usage: EvaluationResult<
      Record<string, EvaluationQuestion>
    >['usage'];

    /** Warnings from the evaluation model. */
    readonly warnings: EvaluationResult<
      Record<string, EvaluationQuestion>
    >['warnings'];

    /** Provider-declared decimal precision for probabilities and scores. */
    readonly rounding: EvaluationResult<
      Record<string, EvaluationQuestion>
    >['rounding'];

    /** Optional provider-specific metadata. */
    readonly providerMetadata: EvaluationResult<
      Record<string, EvaluationQuestion>
    >['providerMetadata'];

    /** Response metadata, including the resolved model ID and timestamp. */
    readonly response: EvaluationResult<
      Record<string, EvaluationQuestion>
    >['response'];
  };

/**
 * Event fired when the evaluation model call begins.
 *
 * The logical model call includes any provider retries.
 */
export type EvaluationModelCallStartEvent = {
  /** Unique identifier for the outer evaluation call. */
  readonly callId: string;

  /** Identifies the inner operation (`ai.evaluate.doEvaluate`). */
  readonly operationId: 'ai.evaluate.doEvaluate';

  /** The provider identifier. */
  readonly provider: string;

  /** The evaluation model identifier. */
  readonly modelId: string;

  /** The shared state being evaluated. */
  readonly state: EvaluationModelV4CallOptions['state'];

  /** The questions being evaluated against the shared state. */
  readonly questions: Readonly<Record<string, EvaluationQuestion>>;
};

/**
 * Event fired after the evaluation model response has been validated.
 *
 * Contains the result of the logical model call, including any retries.
 */
export type EvaluationModelCallEndEvent = EvaluationModelCallStartEvent & {
  /** Exactly one answer per question ID. */
  readonly answers: EvaluationModelV4Result['answers'];

  /** Token usage reported by the evaluation model. */
  readonly usage?: EvaluationModelV4Result['usage'];

  /** Warnings from the evaluation model. */
  readonly warnings: EvaluationModelV4Result['warnings'];

  /** Provider-declared decimal precision for probabilities and scores. */
  readonly rounding?: EvaluationModelV4Result['rounding'];

  /** Optional provider-specific metadata. */
  readonly providerMetadata?: EvaluationModelV4Result['providerMetadata'];

  /** Optional raw response metadata from the provider. */
  readonly response?: EvaluationModelV4Result['response'];
};
