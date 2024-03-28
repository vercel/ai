import { LanguageModelV1CallOptions } from './language-model-v1-call-options';
import { LanguageModelV1CallWarning } from './language-model-v1-call-warning';
import { LanguageModelV1FinishReason } from './language-model-v1-finish-reason';
import { LanguageModelV1FunctionToolCall } from './language-model-v1-function-tool-call';

/**
 * Experimental: Specification for a language model that implements the language model
 * interface version 1.
 */
export type LanguageModelV1 = {
  /**
   * The language model must specify which language model interface
   * version it implements. This will allow us to evolve the language
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v1';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Default object generation mode that should be used with this model when
   * no mode is specified. Should be the mode with the best results for this
   * model. `undefined` can be returned if object generation is not supported.
   *
   * This is needed to generate the best objects possible w/o requiring the
   * user to explicitly specify the object generation mode.
   */
  readonly defaultObjectGenerationMode: 'json' | 'tool' | 'grammar' | undefined;

  /**
   * Generates a language model output (non-streaming).
   *
   * Naming: "do" prefix to prevent accidental direct usage of the method
   * by the user.
   */
  doGenerate(options: LanguageModelV1CallOptions): PromiseLike<{
    /**
     * Text that the model has generated. Can be undefined if the model
     * has only generated tool calls.
     */
    text?: string;

    /**
     * Tool calls that the model has generated. Can be undefined if the
     * model has only generated text.
     */
    toolCalls?: Array<LanguageModelV1FunctionToolCall>;

    /**
     * Finish reason.
     */
    finishReason: LanguageModelV1FinishReason;

    /**
     * Usage information.
     */
    usage: {
      promptTokens: number;
      completionTokens: number;
    };

    /**
     * Raw prompt and setting information for observability provider integration.
     */
    rawCall: {
      /**
       * Raw prompt after expansion and conversion to the format that the
       * provider uses to send the information to their API.
       */
      rawPrompt: unknown;

      /**
       * Raw settings that are used for the API call. Includes provider-specific
       * settings.
       */
      rawSettings: Record<string, unknown>;
    };

    warnings?: LanguageModelV1CallWarning[];
  }>;

  /**
   * Generates a language model output (streaming).
   *
   * Naming: "do" prefix to prevent accidental direct usage of the method
   * by the user.
   *
   * @return A stream of higher-level language model output parts.
   */
  doStream(options: LanguageModelV1CallOptions): PromiseLike<{
    stream: ReadableStream<LanguageModelV1StreamPart>;

    /**
     * Raw prompt and setting information for observability provider integration.
     */
    rawCall: {
      /**
       * Raw prompt after expansion and conversion to the format that the
       * provider uses to send the information to their API.
       */
      rawPrompt: unknown;

      /**
       * Raw settings that are used for the API call. Includes provider-specific
       * settings.
       */
      rawSettings: Record<string, unknown>;
    };

    warnings?: LanguageModelV1CallWarning[];
  }>;
};

export type LanguageModelV1StreamPart =
  // Basic text deltas:
  | { type: 'text-delta'; textDelta: string }

  // Complete tool calls:
  | ({ type: 'tool-call' } & LanguageModelV1FunctionToolCall)

  // Tool call deltas are only needed for object generation modes.
  // The tool call deltas must be partial JSON strings.
  | {
      type: 'tool-call-delta';
      toolCallType: 'function';
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    }

  // the usage stats and finish reason should be the last part of the
  // stream:
  | {
      type: 'finish';
      finishReason: LanguageModelV1FinishReason;
      usage: { promptTokens: number; completionTokens: number };
    }

  // error parts are streamed, allowing for multiple errors
  | { type: 'error'; error: unknown };
