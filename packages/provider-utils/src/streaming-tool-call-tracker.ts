import {
  InvalidResponseDataError,
  LanguageModelV3StreamPart,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import { generateId as defaultGenerateId } from './generate-id';

type StreamController =
  TransformStreamDefaultController<LanguageModelV3StreamPart>;

/**
 * Shape of a tool call delta from OpenAI-compatible streaming APIs.
 * Extra properties (e.g. `extra_content`) are passed through to
 * `extractMetadata` via the index signature.
 */
export type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function: {
    name?: string;
    arguments?: string;
  };
  [key: string]: unknown;
};

type TrackedToolCall<METADATA> = {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
  hasFinished: boolean;
  metadata?: METADATA;
};

/**
 * Tracks streaming tool call state for OpenAI-compatible providers.
 *
 * Accumulates tool call arguments across streamed deltas and only
 * finalizes (emits tool-call events) in flush(), preventing premature
 * execution when partial JSON is coincidentally parsable.
 */
export class StreamingToolCallTracker<METADATA = undefined> {
  private toolCalls: Array<TrackedToolCall<METADATA>> = [];
  private generateId: () => string;

  constructor({ generateId }: { generateId?: () => string } = {}) {
    this.generateId = generateId ?? defaultGenerateId;
  }

  /**
   * Process a tool call delta from a streaming chunk.
   * Handles both initial (start) and subsequent (argument accumulation) deltas.
   */
  handleDelta(
    toolCallDelta: ToolCallDelta,
    controller: StreamController,
    options?: {
      /**
       * Whether to validate that `type` is `'function'` on the first delta.
       * Default: false.
       */
      validateType?: boolean;
      /**
       * Extract provider-specific metadata from the first delta.
       */
      extractMetadata?: (delta: ToolCallDelta) => METADATA | undefined;
    },
  ): void {
    const index = toolCallDelta.index ?? this.toolCalls.length;

    // New tool call
    if (this.toolCalls[index] == null) {
      if (options?.validateType) {
        if (toolCallDelta.type != null && toolCallDelta.type !== 'function') {
          throw new InvalidResponseDataError({
            data: toolCallDelta,
            message: `Expected 'function' type.`,
          });
        }
      }

      if (toolCallDelta.id == null) {
        throw new InvalidResponseDataError({
          data: toolCallDelta,
          message: `Expected 'id' to be a string.`,
        });
      }

      if (toolCallDelta.function?.name == null) {
        throw new InvalidResponseDataError({
          data: toolCallDelta,
          message: `Expected 'function.name' to be a string.`,
        });
      }

      controller.enqueue({
        type: 'tool-input-start',
        id: toolCallDelta.id,
        toolName: toolCallDelta.function.name,
      });

      this.toolCalls[index] = {
        id: toolCallDelta.id,
        function: {
          name: toolCallDelta.function.name,
          arguments: toolCallDelta.function.arguments ?? '',
        },
        hasFinished: false,
        metadata: options?.extractMetadata?.(toolCallDelta),
      };

      const toolCall = this.toolCalls[index];

      // Send initial delta if arguments already present in the first chunk
      if (toolCall.function.arguments.length > 0) {
        controller.enqueue({
          type: 'tool-input-delta',
          id: toolCall.id,
          delta: toolCall.function.arguments,
        });
      }

      return;
    }

    // Existing tool call - accumulate arguments
    const toolCall = this.toolCalls[index];

    if (toolCall.hasFinished) {
      return;
    }

    if (toolCallDelta.function?.arguments != null) {
      toolCall.function.arguments += toolCallDelta.function.arguments;
    }

    controller.enqueue({
      type: 'tool-input-delta',
      id: toolCall.id,
      delta: toolCallDelta.function?.arguments ?? '',
    });
  }

  /**
   * Finalize all unfinished tool calls. Must be called in flush()
   * to ensure tool calls receive complete arguments.
   */
  flush(
    controller: StreamController,
    options?: {
      /**
       * Build provider-specific metadata for the tool-call event.
       */
      buildToolCallProviderMetadata?: (
        metadata: METADATA | undefined,
      ) => SharedV3ProviderMetadata | undefined;
    },
  ): void {
    for (const toolCall of this.toolCalls) {
      if (toolCall.hasFinished) {
        continue;
      }

      controller.enqueue({
        type: 'tool-input-end',
        id: toolCall.id,
      });

      const providerMetadata = options?.buildToolCallProviderMetadata?.(
        toolCall.metadata,
      );

      controller.enqueue({
        type: 'tool-call',
        toolCallId: toolCall.id ?? this.generateId(),
        toolName: toolCall.function.name,
        input: toolCall.function.arguments,
        ...(providerMetadata ? { providerMetadata } : {}),
      });

      toolCall.hasFinished = true;
    }
  }
}
