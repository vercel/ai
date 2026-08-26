import {
  InvalidResponseDataError,
  type LanguageModelV4StreamPart,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { generateId as defaultGenerateId } from './generate-id';
import {
  startsWithStructuredValue,
  StreamingToolCallArgumentState,
} from './streaming-tool-call-argument-state';

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
  argumentState: StreamingToolCallArgumentState;
  hasFinished: boolean;
  metadata?: SharedV4ProviderMetadata;
}

type ToolCallResolution =
  | { kind: 'existing'; toolCall: TrackedToolCall }
  | { kind: 'new' }
  | { kind: 'ambiguous' };

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
 * Used by openai, openai-compatible, groq, deepseek, alibaba, mistral, and
 * moonshotai providers.
 */
export class StreamingToolCallTracker<
  DELTA extends StreamingToolCallDelta = StreamingToolCallDelta,
> {
  private toolCalls: TrackedToolCall[] = [];
  private toolCallsById = new Map<string, Set<TrackedToolCall>>();
  private toolCallsByIndex = new Map<number, Set<TrackedToolCall>>();
  private usedToolCallIds = new Set<string>();
  private nextGeneratedIdSuffixes = new Map<string, number>();
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
    const wireName = toolCallDelta.function?.name;
    const hasBlankName =
      typeof wireName === 'string' && wireName.trim().length === 0;
    const wireId = this.getNonBlankString(toolCallDelta.id);
    const name = this.getNonBlankString(wireName);
    const { index } = toolCallDelta;

    const resolution = this.resolveToolCall({
      wireId,
      index,
      name,
      hasExplicitCallStart:
        name != null &&
        startsWithStructuredValue(toolCallDelta.function?.arguments),
    });

    if (resolution.kind === 'ambiguous') {
      return;
    }

    let toolCall: TrackedToolCall;
    if (resolution.kind === 'new') {
      // Blank names cannot start a usable call, but some providers repeat a
      // blank name on continuations. Correlate those continuations first, then
      // ignore only the unmatched blank-name delta.
      if (hasBlankName) {
        return;
      }

      toolCall = this.processNewToolCall(toolCallDelta, {
        wireId,
        index,
        name,
      });
    } else {
      toolCall = resolution.toolCall;
      if (wireId != null) {
        this.associateWireId(toolCall, wireId);
      }
      this.processExistingToolCall(toolCall, toolCallDelta);
    }

    if (index != null) {
      this.associateIndex(toolCall, index);
    }
  }

  /**
   * Finalize any unfinished tool calls. Should be called during the stream's
   * flush handler to ensure all tool calls are properly completed.
   */
  flush(): void {
    // Index order is reliable only when every call has an index. For mixed
    // streams, keep insertion order rather than moving all index-less calls
    // behind indexed calls.
    const toolCalls = this.toolCalls.every(toolCall => toolCall.index != null)
      ? [...this.toolCalls].sort(
          (a, b) => a.index! - b.index! || a.sequence - b.sequence,
        )
      : this.toolCalls;

    for (const toolCall of toolCalls) {
      if (!toolCall.hasFinished) {
        this.finishToolCall(toolCall);
      }
    }
  }

  /**
   * Correlation precedence for streamed deltas:
   *
   * | ID evidence | index/name evidence | start evidence | resolution |
   * | --- | --- | --- | --- |
   * | known | matching | any | matching call, new call, or ambiguity |
   * | known | conflicting | named | new call |
   * | unseen | matching | structured start | new call |
   * | unseen | matching | continuation | matching call or ambiguity |
   * | absent | matching | any | matching call, new call, or ambiguity |
   * | absent | absent | named | new call |
   * | absent | absent | unnamed | sole unfinished call, new call, or ambiguity |
   */
  private resolveToolCall({
    wireId,
    index,
    name,
    hasExplicitCallStart,
  }: {
    wireId: string | undefined;
    index: number | null | undefined;
    name: string | undefined;
    hasExplicitCallStart: boolean;
  }): ToolCallResolution {
    const indexedToolCalls =
      index != null ? this.toolCallsByIndex.get(index) : undefined;
    const matchingIndexedToolCalls = this.filterToolCallsByName(
      indexedToolCalls,
      name,
    );

    if (wireId != null) {
      const toolCallsWithId = this.toolCallsById.get(wireId);

      if (toolCallsWithId != null) {
        if (index != null) {
          const matchingToolCalls = matchingIndexedToolCalls.filter(toolCall =>
            toolCallsWithId.has(toolCall),
          );
          const matchingToolCall = this.resolveMatchingToolCall(
            matchingToolCalls,
            hasExplicitCallStart,
          );
          if (matchingToolCall.kind !== 'new') {
            return matchingToolCall;
          }

          // A named delta with a distinct index starts a new call even when its
          // wire ID and function name repeat. Providers may reuse IDs across
          // parallel calls, so the ID/name pair cannot override index evidence.
          if (name != null) {
            return { kind: 'new' };
          }

          // Conflicting labels on a continuation cannot be resolved safely.
          if (indexedToolCalls != null) {
            return { kind: 'ambiguous' };
          }

          return this.resolveMatchingToolCall([...toolCallsWithId], false);
        }

        if (name != null) {
          const matchingToolCalls = [...toolCallsWithId].filter(
            toolCall => toolCall.function.name === name,
          );

          return this.resolveMatchingToolCall(
            matchingToolCalls,
            hasExplicitCallStart,
          );
        }

        return this.resolveMatchingToolCall([...toolCallsWithId], false);
      }

      if (matchingIndexedToolCalls.length > 0) {
        // A previously unseen ID plus a named structured argument start is
        // stronger evidence of a distinct call than a reused index/name. This
        // also keeps interleaved same-name calls separate while still allowing
        // IDs to change on ordinary continuation fragments.
        return hasExplicitCallStart
          ? { kind: 'new' }
          : this.resolveMatchingToolCall(matchingIndexedToolCalls, false);
      }

      return { kind: 'new' };
    }

    if (indexedToolCalls != null) {
      // Repeated names are valid on continuations. A different name at the
      // same index is evidence of a new call from a provider that reuses
      // indices across parallel calls.
      return this.resolveMatchingToolCall(
        matchingIndexedToolCalls,
        hasExplicitCallStart,
      );
    }

    if (name != null) {
      return { kind: 'new' };
    }

    const unfinishedToolCalls = this.toolCalls.filter(
      toolCall => !toolCall.hasFinished,
    );
    if (unfinishedToolCalls.length === 1) {
      return { kind: 'existing', toolCall: unfinishedToolCalls[0] };
    }
    return unfinishedToolCalls.length > 1
      ? { kind: 'ambiguous' }
      : { kind: 'new' };
  }

  private filterToolCallsByName(
    toolCalls: Set<TrackedToolCall> | undefined,
    name: string | undefined,
  ): TrackedToolCall[] {
    if (toolCalls == null) {
      return [];
    }

    return [...toolCalls].filter(
      toolCall => name == null || toolCall.function.name === name,
    );
  }

  private resolveMatchingToolCall(
    toolCalls: TrackedToolCall[],
    hasExplicitCallStart: boolean,
  ): ToolCallResolution {
    if (toolCalls.length === 0) {
      return { kind: 'new' };
    }

    if (!hasExplicitCallStart) {
      return toolCalls.length === 1
        ? { kind: 'existing', toolCall: toolCalls[0] }
        : { kind: 'ambiguous' };
    }

    // A repeated name can occur on continuations. A fresh structured
    // argument prefix is evidence of another call only after the matching call
    // has completed its own structured argument payload.
    const continuableToolCalls = toolCalls.filter(
      toolCall => !toolCall.argumentState.hasCompleteStructuredValue,
    );

    if (continuableToolCalls.length === 1) {
      return { kind: 'existing', toolCall: continuableToolCalls[0] };
    }

    return continuableToolCalls.length > 1
      ? { kind: 'ambiguous' }
      : { kind: 'new' };
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

    const initialArguments = toolCallDelta.function?.arguments ?? '';
    const toolCall: TrackedToolCall = {
      id,
      index: index ?? undefined,
      sequence: this.toolCalls.length,
      type: 'function',
      function: {
        name,
        arguments: initialArguments,
      },
      argumentState: new StreamingToolCallArgumentState(initialArguments),
      hasFinished: false,
      metadata,
    };
    this.toolCalls.push(toolCall);
    if (wireId != null) {
      this.associateWireId(toolCall, wireId);
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

  private associateWireId(toolCall: TrackedToolCall, wireId: string): void {
    let toolCallsWithId = this.toolCallsById.get(wireId);
    if (toolCallsWithId == null) {
      toolCallsWithId = new Set();
      this.toolCallsById.set(wireId, toolCallsWithId);
    }
    toolCallsWithId.add(toolCall);
  }

  private associateIndex(toolCall: TrackedToolCall, index: number): void {
    let toolCallsWithIndex = this.toolCallsByIndex.get(index);
    if (toolCallsWithIndex == null) {
      toolCallsWithIndex = new Set();
      this.toolCallsByIndex.set(index, toolCallsWithIndex);
    }
    toolCallsWithIndex.add(toolCall);
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

    // Resume after the last suffix checked for this generated value. This
    // keeps deterministic generators bounded without repeatedly rescanning
    // the same occupied suffixes.
    const initialSuffix = this.nextGeneratedIdSuffixes.get(generatedId) ?? 1;
    const maximumSuffix = initialSuffix + this.usedToolCallIds.size;
    for (let suffix = initialSuffix; suffix <= maximumSuffix; suffix++) {
      const suffixedId = `${generatedId}-${suffix}`;
      if (!this.usedToolCallIds.has(suffixedId)) {
        this.usedToolCallIds.add(suffixedId);
        this.nextGeneratedIdSuffixes.set(generatedId, suffix + 1);
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
      toolCall.argumentState.append(toolCallDelta.function.arguments);
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
