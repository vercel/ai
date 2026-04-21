import {
  InvalidResponseDataError,
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { generateId as defaultGenerateId } from './generate-id';
import { isParsableJson } from './parse-json';

/**
 * Minimal interface for a streaming tool call delta from an OpenAI-compatible API.
 */
export interface StreamingToolCallDelta {
  index?: number | null;
  id?: string | null;
  type?: string | null;
  function?: {
    name?: string | null;
    arguments?: string | null;
  } | null;
}

export interface StreamingToolCallTrackerOptions {
  /**
   * ID generator function for tool call IDs.
   * Defaults to the standard generateId.
   */
  generateId?: () => string;

  /**
   * How to validate the `type` field on new tool call deltas.
   * - `'none'`: no validation (default)
   * - `'if-present'`: throw if type is present and not `'function'`
   * - `'required'`: throw if type is not exactly `'function'`
   */
  typeValidation?: 'none' | 'if-present' | 'required';

  /**
   * Extract provider-specific metadata from a tool call delta.
   * Called once when a new tool call is detected.
   * The returned metadata is stored on the tool call and passed to
   * `buildToolCallProviderMetadata` when the tool call is finalized.
   */
  extractMetadata?: (
    delta: StreamingToolCallDelta,
  ) => SharedV4ProviderMetadata | undefined;

  /**
   * Build the `providerMetadata` object for a `tool-call` event.
   * Receives the metadata previously extracted via `extractMetadata`.
   * If `undefined` is returned, no `providerMetadata` is included in the event.
   */
  buildToolCallProviderMetadata?: (
    metadata: SharedV4ProviderMetadata | undefined,
  ) => SharedV4ProviderMetadata | undefined;
}

interface TrackedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  hasFinished: boolean;
  metadata?: SharedV4ProviderMetadata;
}

/**
 * Tracks streaming tool call state across multiple deltas from an
 * OpenAI-compatible chat completion stream. Handles argument accumulation,
 * emits tool-input-start/delta/end and tool-call events, and finalizes
 * unfinished tool calls on flush.
 *
 * Used by openai, openai-compatible, groq, deepseek, and alibaba providers.
 */
export class StreamingToolCallTracker {
  private toolCalls: TrackedToolCall[] = [];
  private readonly _generateId: () => string;
  private readonly typeValidation: 'none' | 'if-present' | 'required';
  private readonly extractMetadata?: (
    delta: StreamingToolCallDelta,
  ) => SharedV4ProviderMetadata | undefined;
  private readonly buildToolCallProviderMetadata?: (
    metadata: SharedV4ProviderMetadata | undefined,
  ) => SharedV4ProviderMetadata | undefined;

  constructor(options: StreamingToolCallTrackerOptions = {}) {
    this._generateId = options.generateId ?? defaultGenerateId;
    this.typeValidation = options.typeValidation ?? 'none';
    this.extractMetadata = options.extractMetadata;
    this.buildToolCallProviderMetadata = options.buildToolCallProviderMetadata;
  }

  /**
   * Process a tool call delta from a streaming response chunk.
   * Emits tool-input-start, tool-input-delta, tool-input-end, and tool-call
   * events as appropriate.
   */
  processDelta(
    toolCallDelta: StreamingToolCallDelta,
    enqueue: (part: LanguageModelV4StreamPart) => void,
  ): void {
    const index = toolCallDelta.index ?? this.toolCalls.length;

    if (this.toolCalls[index] == null) {
      this.processNewToolCall(index, toolCallDelta, enqueue);
    } else {
      this.processExistingToolCall(index, toolCallDelta, enqueue);
    }
  }

  /**
   * Finalize any unfinished tool calls. Should be called during the stream's
   * flush handler to ensure all tool calls are properly completed.
   */
  flush(enqueue: (part: LanguageModelV4StreamPart) => void): void {
    for (const toolCall of this.toolCalls) {
      if (!toolCall.hasFinished) {
        this.finishToolCall(toolCall, enqueue);
      }
    }
  }

  private processNewToolCall(
    index: number,
    toolCallDelta: StreamingToolCallDelta,
    enqueue: (part: LanguageModelV4StreamPart) => void,
  ): void {
    if (this.typeValidation === 'required') {
      if (toolCallDelta.type !== 'function') {
        throw new InvalidResponseDataError({
          data: toolCallDelta,
          message: `Expected 'function' type.`,
        });
      }
    } else if (this.typeValidation === 'if-present') {
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

    enqueue({
      type: 'tool-input-start',
      id: toolCallDelta.id,
      toolName: toolCallDelta.function.name,
    });

    const metadata = this.extractMetadata?.(toolCallDelta);

    this.toolCalls[index] = {
      id: toolCallDelta.id,
      type: 'function',
      function: {
        name: toolCallDelta.function.name,
        arguments: toolCallDelta.function.arguments ?? '',
      },
      hasFinished: false,
      metadata,
    };

    const toolCall = this.toolCalls[index];

    // Emit initial delta if arguments already present
    if (toolCall.function.arguments.length > 0) {
      enqueue({
        type: 'tool-input-delta',
        id: toolCall.id,
        delta: toolCall.function.arguments,
      });
    }

    // Check if tool call is complete
    // (some providers send the full tool call in one chunk)
    if (isParsableJson(toolCall.function.arguments)) {
      this.finishToolCall(toolCall, enqueue);
    }
  }

  private processExistingToolCall(
    index: number,
    toolCallDelta: StreamingToolCallDelta,
    enqueue: (part: LanguageModelV4StreamPart) => void,
  ): void {
    const toolCall = this.toolCalls[index];

    if (toolCall.hasFinished) {
      return;
    }

    if (toolCallDelta.function?.arguments != null) {
      toolCall.function.arguments += toolCallDelta.function.arguments;

      enqueue({
        type: 'tool-input-delta',
        id: toolCall.id,
        delta: toolCallDelta.function.arguments,
      });
    }

    // Check if tool call is complete
    if (isParsableJson(toolCall.function.arguments)) {
      this.finishToolCall(toolCall, enqueue);
    }
  }

  private finishToolCall(
    toolCall: TrackedToolCall,
    enqueue: (part: LanguageModelV4StreamPart) => void,
  ): void {
    enqueue({
      type: 'tool-input-end',
      id: toolCall.id,
    });

    const providerMetadata = this.buildToolCallProviderMetadata?.(
      toolCall.metadata,
    );

    enqueue({
      type: 'tool-call',
      toolCallId: toolCall.id ?? this._generateId(),
      toolName: toolCall.function.name,
      input: toolCall.function.arguments,
      ...(providerMetadata ? { providerMetadata } : {}),
    });

    toolCall.hasFinished = true;
  }
}
