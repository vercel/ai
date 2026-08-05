import {
  InvalidResponseDataError,
  type LanguageModelV4StreamPart,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { generateId as defaultGenerateId } from './generate-id';

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

export interface StreamingToolCallTrackerOptions<
  DELTA extends StreamingToolCallDelta = StreamingToolCallDelta,
> {
  /**
   * ID generator function for tool call IDs.
   * Blank or repeated outputs are converted to usable unique IDs.
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
  extractMetadata?: (delta: DELTA) => SharedV4ProviderMetadata | undefined;

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
  index?: number;
  sequence: number;
  type: 'function';
  function: { name: string; arguments: string };
  hasFinished: boolean;
  metadata?: SharedV4ProviderMetadata;
}

type StreamingToolCallTrackerController = Pick<
  TransformStreamDefaultController<LanguageModelV4StreamPart>,
  'enqueue'
>;

/**
 * Tracks streaming tool call state across multiple deltas from an
 * OpenAI-compatible chat completion stream. Handles argument accumulation,
 * emits tool-input-start/delta/end and tool-call events, and finalizes
 * unfinished tool calls on flush.
 *
 * Used by openai, openai-compatible, groq, deepseek, and alibaba providers.
 */
export class StreamingToolCallTracker<
  DELTA extends StreamingToolCallDelta = StreamingToolCallDelta,
> {
  private toolCalls: TrackedToolCall[] = [];
  private toolCallsById = new Map<string, Set<TrackedToolCall>>();
  private toolCallsByIndex = new Map<number, TrackedToolCall>();
  private usedToolCallIds = new Set<string>();
  private readonly controller: StreamingToolCallTrackerController;
  private readonly _generateId: () => string;
  private readonly typeValidation: 'none' | 'if-present' | 'required';
  private readonly extractMetadata?: (
    delta: DELTA,
  ) => SharedV4ProviderMetadata | undefined;
  private readonly buildToolCallProviderMetadata?: (
    metadata: SharedV4ProviderMetadata | undefined,
  ) => SharedV4ProviderMetadata | undefined;

  constructor(
    controller: StreamingToolCallTrackerController,
    options: StreamingToolCallTrackerOptions<DELTA> = {},
  ) {
    this.controller = controller;
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
  processDelta(toolCallDelta: DELTA): void {
    const wireId = this.getNonBlankString(toolCallDelta.id);
    const name = this.getNonBlankString(toolCallDelta.function?.name);
    const { index } = toolCallDelta;

    // A delta without any association data cannot be attributed safely when
    // multiple calls are active. Ignoring it avoids corrupting an arbitrary
    // call while preserving index-less continuations for a single active call.
    if (
      wireId == null &&
      index == null &&
      name == null &&
      this.toolCalls.filter(toolCall => !toolCall.hasFinished).length > 1
    ) {
      return;
    }

    let toolCall = this.findToolCall({ wireId, index, name });

    if (toolCall == null) {
      toolCall = this.processNewToolCall(toolCallDelta, {
        wireId,
        index,
        name,
      });
    } else {
      this.processExistingToolCall(toolCall, toolCallDelta);
    }

    if (index != null) {
      this.toolCallsByIndex.set(index, toolCall);
    }
  }

  /**
   * Finalize any unfinished tool calls. Should be called during the stream's
   * flush handler to ensure all tool calls are properly completed.
   */
  flush(): void {
    const toolCalls = [...this.toolCalls].sort((a, b) => {
      if (a.index == null && b.index == null) {
        return a.sequence - b.sequence;
      }
      if (a.index == null) {
        return 1;
      }
      if (b.index == null) {
        return -1;
      }
      return a.index - b.index || a.sequence - b.sequence;
    });

    for (const toolCall of toolCalls) {
      if (!toolCall.hasFinished) {
        this.finishToolCall(toolCall);
      }
    }
  }

  private findToolCall({
    wireId,
    index,
    name,
  }: {
    wireId: string | undefined;
    index: number | null | undefined;
    name: string | undefined;
  }): TrackedToolCall | undefined {
    const indexedToolCall =
      index != null ? this.toolCallsByIndex.get(index) : undefined;

    if (wireId != null) {
      const toolCallsWithId = this.toolCallsById.get(wireId);
      if (toolCallsWithId == null) {
        return undefined;
      }

      if (
        indexedToolCall != null &&
        toolCallsWithId.has(indexedToolCall) &&
        (name == null || indexedToolCall.function.name === name)
      ) {
        return indexedToolCall;
      }

      // A named delta with a distinct index starts a new call even when its
      // wire ID and function name repeat. Providers may reuse IDs across
      // parallel calls, so the ID/name pair cannot override index evidence.
      if (index != null && name != null) {
        return undefined;
      }

      if (name != null) {
        const matchingToolCalls = [...toolCallsWithId].filter(
          toolCall => toolCall.function.name === name,
        );

        if (matchingToolCalls.length === 0) {
          return undefined;
        }
        if (matchingToolCalls.length === 1) {
          return matchingToolCalls[0];
        }

        return matchingToolCalls.at(-1);
      }

      if (toolCallsWithId.size === 1) {
        return toolCallsWithId.values().next().value;
      }

      if (indexedToolCall != null && toolCallsWithId.has(indexedToolCall)) {
        return indexedToolCall;
      }

      return [...toolCallsWithId].at(-1);
    }

    // A non-empty function name without a usable ID marks a new call. This
    // supports gateways that reuse the same index for every parallel call.
    if (name != null) {
      return undefined;
    }

    if (indexedToolCall != null) {
      return indexedToolCall;
    }

    const unfinishedToolCalls = this.toolCalls.filter(
      toolCall => !toolCall.hasFinished,
    );
    return unfinishedToolCalls.length === 1
      ? unfinishedToolCalls[0]
      : undefined;
  }

  private processNewToolCall(
    toolCallDelta: DELTA,
    {
      wireId,
      index,
      name,
    }: {
      wireId: string | undefined;
      index: number | null | undefined;
      name: string | undefined;
    },
  ): TrackedToolCall {
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

    if (name == null) {
      throw new InvalidResponseDataError({
        data: toolCallDelta,
        message: `Expected 'function.name' to be a string.`,
      });
    }

    const id = this.createToolCallId(wireId);

    this.controller.enqueue({
      type: 'tool-input-start',
      id,
      toolName: name,
    });

    const metadata = this.extractMetadata?.(toolCallDelta);

    const toolCall: TrackedToolCall = {
      id,
      index: index ?? undefined,
      sequence: this.toolCalls.length,
      type: 'function',
      function: {
        name,
        arguments: toolCallDelta.function?.arguments ?? '',
      },
      hasFinished: false,
      metadata,
    };
    this.toolCalls.push(toolCall);
    if (wireId != null) {
      let toolCallsWithId = this.toolCallsById.get(wireId);
      if (toolCallsWithId == null) {
        toolCallsWithId = new Set();
        this.toolCallsById.set(wireId, toolCallsWithId);
      }
      toolCallsWithId.add(toolCall);
    }

    // Emit initial delta if arguments already present
    if (toolCall.function.arguments.length > 0) {
      this.controller.enqueue({
        type: 'tool-input-delta',
        id: toolCall.id,
        delta: toolCall.function.arguments,
      });
    }

    // Tool calls must not finalize before the stream ends: a parsable
    // argument buffer can still be the prefix of a longer argument string,
    // so acting on it early would use truncated inputs (see #13137).
    // Finalization happens in flush().
    return toolCall;
  }

  private createToolCallId(wireId: string | undefined): string {
    if (wireId != null && !this.usedToolCallIds.has(wireId)) {
      this.usedToolCallIds.add(wireId);
      return wireId;
    }

    const generatedId =
      this.getNonBlankString(this._generateId()) ?? 'tool-call';

    if (!this.usedToolCallIds.has(generatedId)) {
      this.usedToolCallIds.add(generatedId);
      return generatedId;
    }

    // At most usedToolCallIds.size candidates can already be occupied, so
    // checking one more suffix guarantees a unique ID without repeatedly
    // invoking a potentially deterministic custom generator.
    const maximumSuffix = this.usedToolCallIds.size + 1;
    for (let suffix = 1; suffix <= maximumSuffix; suffix++) {
      const suffixedId = `${generatedId}-${suffix}`;
      if (!this.usedToolCallIds.has(suffixedId)) {
        this.usedToolCallIds.add(suffixedId);
        return suffixedId;
      }
    }

    // The bounded search above is guaranteed to return by the pigeonhole
    // principle. This guards against future changes invalidating that
    // invariant without restoring an unbounded retry loop.
    throw new Error('Failed to create a unique tool call ID.');
  }

  private getNonBlankString(
    value: string | null | undefined,
  ): string | undefined {
    return value != null && value.trim().length > 0 ? value : undefined;
  }

  private processExistingToolCall(
    toolCall: TrackedToolCall,
    toolCallDelta: DELTA,
  ): void {
    if (toolCall.hasFinished) {
      return;
    }

    if (toolCallDelta.function?.arguments != null) {
      toolCall.function.arguments += toolCallDelta.function.arguments;

      this.controller.enqueue({
        type: 'tool-input-delta',
        id: toolCall.id,
        delta: toolCallDelta.function.arguments,
      });
    }
  }

  private finishToolCall(toolCall: TrackedToolCall): void {
    this.controller.enqueue({
      type: 'tool-input-end',
      id: toolCall.id,
    });

    const providerMetadata = this.buildToolCallProviderMetadata?.(
      toolCall.metadata,
    );

    this.controller.enqueue({
      type: 'tool-call',
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      input: toolCall.function.arguments,
      ...(providerMetadata ? { providerMetadata } : {}),
    });

    toolCall.hasFinished = true;
  }
}
