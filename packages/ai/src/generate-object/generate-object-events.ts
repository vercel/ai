import type { JSONValue, LanguageModelV4Prompt } from '@ai-sdk/provider';
import type {
  ModelMessage,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import type {
  CallWarning,
  FinishReason,
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  ProviderMetadata,
} from '../types';
import type { LanguageModelUsage } from '../types/usage';
import type { Listener } from '../util/notify';

/**
 * Event passed to the `experimental_onStart` callback of `generateObject`.
 *
 * Called when the generateObject operation begins, before the LLM call.
 */
export interface GenerateObjectOnStartEvent {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type. Always `'ai.generateObject'`. */
  readonly operationId: 'ai.generateObject';

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** The system message(s) provided to the model. */
  readonly system:
    | string
    | SystemModelMessage
    | Array<SystemModelMessage>
    | undefined;

  /** The prompt string or array of messages if using the prompt option. */
  readonly prompt: string | Array<ModelMessage> | undefined;

  /** The messages array if using the messages option. */
  readonly messages: Array<ModelMessage> | undefined;

  /** Maximum number of tokens to generate. */
  readonly maxOutputTokens: number | undefined;
  /** Sampling temperature for generation. */
  readonly temperature: number | undefined;
  /** Top-p (nucleus) sampling parameter. */
  readonly topP: number | undefined;
  /** Top-k sampling parameter. */
  readonly topK: number | undefined;
  /** Presence penalty for generation. */
  readonly presencePenalty: number | undefined;
  /** Frequency penalty for generation. */
  readonly frequencyPenalty: number | undefined;
  /** Random seed for reproducible generation. */
  readonly seed: number | undefined;
  /** Maximum number of retries for failed requests. */
  readonly maxRetries: number;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /** Abort signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;

  /** The output strategy type. */
  readonly output: 'object' | 'array' | 'enum' | 'no-schema';

  /** The JSON Schema used for object generation, if any. */
  readonly schema: Record<string, unknown> | undefined;

  /** Optional name of the schema. */
  readonly schemaName: string | undefined;

  /** Optional description of the schema. */
  readonly schemaDescription: string | undefined;

  /** Whether telemetry is enabled. */
  readonly isEnabled: boolean | undefined;

  /** Whether to record inputs in telemetry. Enabled by default. */
  readonly recordInputs: boolean | undefined;

  /** Whether to record outputs in telemetry. Enabled by default. */
  readonly recordOutputs: boolean | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, JSONValue> | undefined;
}

/**
 * Event passed to the `experimental_onStepStart` callback of `generateObject`.
 *
 * Called when the model call (step) begins, before the provider is called.
 * For `generateObject`, there is always exactly one step (step 0).
 */
export interface GenerateObjectOnStepStartEvent {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Zero-based index of the current step. Always `0` for `generateObject`. */
  readonly stepNumber: 0;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Abort signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;

  /** The prompt messages in provider format (for telemetry). */
  readonly promptMessages?: LanguageModelV4Prompt;
}

/**
 * Event passed to the `onStepFinish` callback of `generateObject`.
 *
 * Called when the model call (step) completes, with the raw result
 * before JSON parsing and schema validation.
 */
export interface GenerateObjectOnStepFinishEvent {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Zero-based index of the current step. Always `0` for `generateObject`. */
  readonly stepNumber: 0;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** The unified reason why the generation finished. */
  readonly finishReason: FinishReason;

  /** The token usage of the generated response. */
  readonly usage: LanguageModelUsage;

  /** The raw text output from the model (before JSON parsing). */
  readonly objectText: string;

  /** The reasoning generated by the model, if any. */
  readonly reasoning: string | undefined;

  /** Warnings from the model provider (e.g. unsupported settings). */
  readonly warnings: CallWarning[] | undefined;

  /** Additional request information. */
  readonly request: LanguageModelRequestMetadata;

  /** Additional response information. */
  readonly response: LanguageModelResponseMetadata & {
    body?: unknown;
  };

  /** Additional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;
}

/**
 * Event passed to the `onFinish` callback of `generateObject`.
 *
 * Called when the entire operation completes, including JSON parsing
 * and schema validation. Contains the final typed object.
 */
export interface GenerateObjectOnFinishEvent<RESULT> {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** The generated object (typed according to the schema). */
  readonly object: RESULT;

  /** The reasoning generated by the model, if any. */
  readonly reasoning: string | undefined;

  /** The unified reason why the generation finished. */
  readonly finishReason: FinishReason;

  /** The token usage of the generated response. */
  readonly usage: LanguageModelUsage;

  /** Warnings from the model provider (e.g. unsupported settings). */
  readonly warnings: CallWarning[] | undefined;

  /** Additional request information. */
  readonly request: LanguageModelRequestMetadata;

  /** Additional response information. */
  readonly response: LanguageModelResponseMetadata & {
    body?: unknown;
  };

  /** Additional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;
}

/**
 * Event passed to the `experimental_onStart` callback of `streamObject`.
 *
 * Called when the streamObject operation begins, before the LLM call.
 */
export interface StreamObjectOnStartEvent {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type. Always `'ai.streamObject'`. */
  readonly operationId: 'ai.streamObject';

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** The system message(s) provided to the model. */
  readonly system:
    | string
    | SystemModelMessage
    | Array<SystemModelMessage>
    | undefined;

  /** The prompt string or array of messages if using the prompt option. */
  readonly prompt: string | Array<ModelMessage> | undefined;

  /** The messages array if using the messages option. */
  readonly messages: Array<ModelMessage> | undefined;

  /** Maximum number of tokens to generate. */
  readonly maxOutputTokens: number | undefined;
  /** Sampling temperature for generation. */
  readonly temperature: number | undefined;
  /** Top-p (nucleus) sampling parameter. */
  readonly topP: number | undefined;
  /** Top-k sampling parameter. */
  readonly topK: number | undefined;
  /** Presence penalty for generation. */
  readonly presencePenalty: number | undefined;
  /** Frequency penalty for generation. */
  readonly frequencyPenalty: number | undefined;
  /** Random seed for reproducible generation. */
  readonly seed: number | undefined;
  /** Maximum number of retries for failed requests. */
  readonly maxRetries: number;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /** Abort signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;

  /** The output strategy type. */
  readonly output: 'object' | 'array' | 'enum' | 'no-schema';

  /** The JSON Schema used for object generation, if any. */
  readonly schema: Record<string, unknown> | undefined;

  /** Optional name of the schema. */
  readonly schemaName: string | undefined;

  /** Optional description of the schema. */
  readonly schemaDescription: string | undefined;

  /** Whether telemetry is enabled. */
  readonly isEnabled: boolean | undefined;

  /** Whether to record inputs in telemetry. Enabled by default. */
  readonly recordInputs: boolean | undefined;

  /** Whether to record outputs in telemetry. Enabled by default. */
  readonly recordOutputs: boolean | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, JSONValue> | undefined;
}

/**
 * Event passed to the `experimental_onStepStart` callback of `streamObject`.
 *
 * Called when the model call (step) begins, before the provider is called.
 * For `streamObject`, there is always exactly one step (step 0).
 */
export interface StreamObjectOnStepStartEvent {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Zero-based index of the current step. Always `0` for `streamObject`. */
  readonly stepNumber: 0;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Abort signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;

  /** The prompt messages in provider format (for telemetry). */
  readonly promptMessages?: LanguageModelV4Prompt;
}

/**
 * Event passed to the `onStepFinish` callback of `streamObject`.
 *
 * Called when the model streaming step completes, with the raw accumulated text
 * before final schema validation. Fires before `onFinish`.
 */
export interface StreamObjectOnStepFinishEvent {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Zero-based index of the current step. Always `0` for `streamObject`. */
  readonly stepNumber: 0;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** The unified reason why the generation finished. */
  readonly finishReason: FinishReason;

  /** The token usage of the generated response. */
  readonly usage: LanguageModelUsage;

  /** The raw accumulated text output from the model (before final JSON parsing). */
  readonly objectText: string;

  /** Warnings from the model provider (e.g. unsupported settings). */
  readonly warnings: CallWarning[] | undefined;

  /** Additional request information. */
  readonly request: LanguageModelRequestMetadata;

  /** Additional response information. */
  readonly response: LanguageModelResponseMetadata & {
    body?: unknown;
  };

  /** Additional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;
}

/**
 * Event passed to the `onFinish` callback of `streamObject`.
 *
 * Called when the entire streaming operation completes, including final
 * object parsing and schema validation. The object may be undefined if
 * validation failed (the error is provided in that case).
 */
export interface StreamObjectOnFinishEvent<RESULT> {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** The generated object, or undefined if parsing/validation failed. */
  readonly object: RESULT | undefined;

  /** Error from parsing or schema validation, if any. */
  readonly error: unknown | undefined;

  /** The unified reason why the generation finished. */
  readonly finishReason: FinishReason;

  /** The token usage of the generated response. */
  readonly usage: LanguageModelUsage;

  /** Warnings from the model provider (e.g. unsupported settings). */
  readonly warnings: CallWarning[] | undefined;

  /** Additional request information. */
  readonly request: LanguageModelRequestMetadata;

  /** Additional response information. */
  readonly response: LanguageModelResponseMetadata;

  /** Additional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;
}
