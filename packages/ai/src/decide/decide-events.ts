import type {
  Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
  Experimental_DecisionModelV4Result as DecisionModelV4Result,
} from '@ai-sdk/provider';
import type { Context, ProviderOptions } from '@ai-sdk/provider-utils';
import type { DecisionQuestion, DecisionResult } from './decision-result';

/**
 * Event passed to the `onStart` callback for decision operations.
 *
 * Called when the operation begins, before the decision model is called.
 */
export type DecideStartEvent<RUNTIME_CONTEXT extends Context = Context> = {
  /** User-defined runtime context. */
  readonly runtimeContext: RUNTIME_CONTEXT;

  /** Unique identifier for this decision call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type (`ai.decide`). */
  readonly operationId: 'ai.decide';

  /** The provider identifier. */
  readonly provider: string;

  /** The decision model identifier. */
  readonly modelId: string;

  /** The shared state used to make decisions. */
  readonly state: DecisionModelV4CallOptions['state'];

  /** The questions to decide against the shared state. */
  readonly questions: Readonly<Record<string, DecisionQuestion>>;

  /** Maximum number of retries for the decision model call. */
  readonly maxRetries: number;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions;
};

/**
 * Event passed to the `onEnd` callback for decision operations.
 *
 * Called when the operation completes successfully.
 */
export type DecideEndEvent<RUNTIME_CONTEXT extends Context = Context> =
  DecideStartEvent<RUNTIME_CONTEXT> & {
    /** Exactly one typed answer per question ID. */
    readonly answers: DecisionResult<
      Record<string, DecisionQuestion>
    >['answers'];

    /** Token usage for the decision operation. */
    readonly usage: DecisionResult<Record<string, DecisionQuestion>>['usage'];

    /** Warnings from the decision model. */
    readonly warnings: DecisionResult<
      Record<string, DecisionQuestion>
    >['warnings'];

    /** Provider-declared decimal precision for probabilities and scores. */
    readonly rounding: DecisionResult<
      Record<string, DecisionQuestion>
    >['rounding'];

    /** Optional provider-specific metadata. */
    readonly providerMetadata: DecisionResult<
      Record<string, DecisionQuestion>
    >['providerMetadata'];

    /** Response metadata, including the resolved model ID and timestamp. */
    readonly response: DecisionResult<
      Record<string, DecisionQuestion>
    >['response'];
  };

/**
 * Event fired when the decision model call begins.
 *
 * The logical model call includes any provider retries.
 */
export type DecisionModelCallStartEvent = {
  /** Unique identifier for the outer decision call. */
  readonly callId: string;

  /** Identifies the inner operation (`ai.decide.doDecide`). */
  readonly operationId: 'ai.decide.doDecide';

  /** The provider identifier. */
  readonly provider: string;

  /** The decision model identifier. */
  readonly modelId: string;

  /** The shared state used to make decisions. */
  readonly state: DecisionModelV4CallOptions['state'];

  /** The questions to decide against the shared state. */
  readonly questions: Readonly<Record<string, DecisionQuestion>>;
};

/**
 * Event fired after the decision model response has been validated.
 *
 * Contains the result of the logical model call, including any retries.
 */
export type DecisionModelCallEndEvent = DecisionModelCallStartEvent & {
  /** Exactly one answer per question ID. */
  readonly answers: DecisionModelV4Result['answers'];

  /** Token usage reported by the decision model. */
  readonly usage?: DecisionModelV4Result['usage'];

  /** Warnings from the decision model. */
  readonly warnings: DecisionModelV4Result['warnings'];

  /** Provider-declared decimal precision for probabilities and scores. */
  readonly rounding?: DecisionModelV4Result['rounding'];

  /** Optional provider-specific metadata. */
  readonly providerMetadata?: DecisionModelV4Result['providerMetadata'];

  /** Optional raw response metadata from the provider. */
  readonly response?: DecisionModelV4Result['response'];
};
