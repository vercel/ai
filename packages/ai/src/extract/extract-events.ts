import type {
  Experimental_ExtractionModelV4CallOptions as ExtractionModelV4CallOptions,
  Experimental_ExtractionModelV4Field as ExtractionField,
  Experimental_ExtractionModelV4Result as ExtractionModelV4Result,
} from '@ai-sdk/provider';
import type { Context, ProviderOptions } from '@ai-sdk/provider-utils';
import type { DecisionState } from '../decide/decision-state';
import type { ExtractionResult } from './extraction-result';

/**
 * Event passed to the `onStart` callback for extraction operations.
 *
 * Called when the operation begins, before the extraction model is called.
 */
export type ExtractStartEvent<RUNTIME_CONTEXT extends Context = Context> = {
  /** User-defined runtime context. */
  readonly runtimeContext: RUNTIME_CONTEXT;

  /** Unique identifier for this extraction call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type (`ai.extract`). */
  readonly operationId: 'ai.extract';

  /** The provider identifier. */
  readonly provider: string;

  /** The extraction model identifier. */
  readonly modelId: string;

  /** The shared state to extract field values from. */
  readonly state: DecisionState;

  /** The fields to extract from the shared state. */
  readonly fields: Readonly<Record<string, ExtractionField>>;

  /** `YYYY-MM-DD` date that anchors relative dates and dates without a year. */
  readonly referenceDate?: string;

  /** Maximum output tokens requested for the extraction. */
  readonly maxOutputTokens?: number;

  /** Reasoning effort requested for the extraction. */
  readonly reasoning?: ExtractionModelV4CallOptions['reasoning'];

  /** Maximum number of retries for the extraction model call. */
  readonly maxRetries: number;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions;
};

/**
 * Event passed to the `onEnd` callback for extraction operations.
 *
 * Called when the operation completes successfully.
 */
export type ExtractEndEvent<RUNTIME_CONTEXT extends Context = Context> =
  ExtractStartEvent<RUNTIME_CONTEXT> & {
    /** Exactly one typed answer per field ID. */
    readonly answers: ExtractionResult<
      Record<string, ExtractionField>
    >['answers'];

    /** Token usage for the extraction operation. */
    readonly usage: ExtractionResult<Record<string, ExtractionField>>['usage'];

    /** Warnings from the extraction model. */
    readonly warnings: ExtractionResult<
      Record<string, ExtractionField>
    >['warnings'];

    /** Optional provider-specific metadata. */
    readonly providerMetadata: ExtractionResult<
      Record<string, ExtractionField>
    >['providerMetadata'];

    /** Response metadata, including the resolved model ID and timestamp. */
    readonly response: ExtractionResult<
      Record<string, ExtractionField>
    >['response'];
  };

/**
 * Event fired when the extraction model call begins.
 *
 * The logical model call includes any provider retries.
 */
export type ExtractionModelCallStartEvent = {
  /** Unique identifier for the outer extraction call. */
  readonly callId: string;

  /** Identifies the inner operation (`ai.extract.doExtract`). */
  readonly operationId: 'ai.extract.doExtract';

  /** The provider identifier. */
  readonly provider: string;

  /** The extraction model identifier. */
  readonly modelId: string;

  /** The shared state to extract field values from. */
  readonly state: ExtractionModelV4CallOptions['state'];

  /** The fields to extract from the shared state. */
  readonly fields: ExtractionModelV4CallOptions['fields'];

  /** `YYYY-MM-DD` date that anchors relative dates and dates without a year. */
  readonly referenceDate?: ExtractionModelV4CallOptions['referenceDate'];
};

/**
 * Event fired after the extraction model response has been validated.
 *
 * Contains the result of the logical model call, including any retries.
 */
export type ExtractionModelCallEndEvent = ExtractionModelCallStartEvent & {
  /** Exactly one answer per field ID. */
  readonly answers: ExtractionModelV4Result['answers'];

  /** Token usage reported by the extraction model. */
  readonly usage?: ExtractionModelV4Result['usage'];

  /** Warnings from the extraction model. */
  readonly warnings: ExtractionModelV4Result['warnings'];

  /** Optional provider-specific metadata. */
  readonly providerMetadata?: ExtractionModelV4Result['providerMetadata'];

  /** Optional raw response metadata from the provider. */
  readonly response?: ExtractionModelV4Result['response'];
};
