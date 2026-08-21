import {
  InvalidResponseDataError,
  type LanguageModelV2StreamPart,
  type SharedV2ProviderMetadata,
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
   */
  extractMetadata?: (delta: DELTA) => SharedV2ProviderMetadata | undefined;

  /**
   * Build the `providerMetadata` object for a `tool-call` event.
   */
  buildToolCallProviderMetadata?: (
    metadata: SharedV2ProviderMetadata | undefined,
  ) => SharedV2ProviderMetadata | undefined;
}

interface TrackedToolCall {
  id: string;
  index?: number;
  sequence: number;
  type: 'function';
  function: { name: string; arguments: string };
  hasFinished: boolean;
  metadata?: SharedV2ProviderMetadata;
}

type StreamingToolCallTrackerController = Pick<
  TransformStreamDefaultController<LanguageModelV2StreamPart>,
  'enqueue'
>;

/**
 * Tracks streaming tool call state across multiple deltas from an
 * OpenAI-compatible chat completion stream.
 */
export class StreamingToolCallTracker<
  DELTA extends StreamingToolCallDelta = StreamingToolCallDelta,
> {
  private toolCalls: TrackedToolCall[] = [];
  private toolCallsById = new Map<string, Set<TrackedToolCall>>();
  private toolCallsByIndex = new Map<number, TrackedToolCall>();
  private usedToolCallIds = new Set<string>();
  private nextGeneratedIdSuffixes = new Map<string, number>();
  private readonly controller: StreamingToolCallTrackerController;
  private readonly _generateId: () => string;
  private readonly typeValidation: 'none' | 'if-present' | 'required';
  private readonly extractMetadata?: (
    delta: DELTA,
  ) => SharedV2ProviderMetadata | undefined;
  private readonly buildToolCallProviderMetadata?: (
    metadata: SharedV2ProviderMetadata | undefined,
  ) => SharedV2ProviderMetadata | undefined;

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

  processDelta(toolCallDelta: DELTA): void {
    const wireId = this.getNonBlankString(toolCallDelta.id);
    const name = this.getNonBlankString(toolCallDelta.function?.name);
    const { index } = toolCallDelta;

    const existingToolCall = this.findToolCall({
      wireId,
      index,
      name,
      hasExplicitType: toolCallDelta.type != null,
    });

    // `null` indicates that the available labels match multiple calls or
    // conflict without enough information to choose safely.
    if (existingToolCall === null) {
      return;
    }

    let toolCall: TrackedToolCall;
    if (existingToolCall === undefined) {
      this.validateNewToolCall(toolCallDelta);
      if (name == null) {
        return;
      }
      toolCall = this.processNewToolCall(toolCallDelta, {
        wireId,
        index,
        name,
      });
    } else {
      toolCall = existingToolCall;
      if (wireId != null) {
        this.associateWireId(toolCall, wireId);
      }
      this.processExistingToolCall(toolCall, toolCallDelta);
    }

    if (index != null) {
      this.toolCallsByIndex.set(index, toolCall);
    }
  }

  flush(): void {
    // Index order is reliable only when every call has an index. For mixed
    // streams, keep insertion order rather than moving index-less calls.
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

  private findToolCall({
    wireId,
    index,
    name,
    hasExplicitType,
  }: {
    wireId: string | undefined;
    index: number | null | undefined;
    name: string | undefined;
    hasExplicitType: boolean;
  }): TrackedToolCall | null | undefined {
    const indexedToolCall =
      index != null ? this.toolCallsByIndex.get(index) : undefined;

    if (wireId != null) {
      const toolCallsWithId = this.toolCallsById.get(wireId);

      if (toolCallsWithId != null) {
        if (index != null) {
          if (indexedToolCall != null && toolCallsWithId.has(indexedToolCall)) {
            return this.canContinueToolCall(indexedToolCall, {
              name,
              hasExplicitType,
            })
              ? indexedToolCall
              : undefined;
          }

          // A named delta with a distinct index starts a new call even when its
          // wire ID and function name repeat.
          if (name != null) {
            return undefined;
          }

          if (indexedToolCall != null) {
            return null;
          }

          return toolCallsWithId.size === 1
            ? toolCallsWithId.values().next().value
            : null;
        }

        if (name != null) {
          const matchingToolCalls = [...toolCallsWithId].filter(toolCall =>
            this.canContinueToolCall(toolCall, {
              name,
              hasExplicitType,
            }),
          );

          if (matchingToolCalls.length === 0) {
            return undefined;
          }

          return matchingToolCalls.length === 1 ? matchingToolCalls[0] : null;
        }

        return toolCallsWithId.size === 1
          ? toolCallsWithId.values().next().value
          : null;
      }

      if (indexedToolCall != null) {
        // IDs can change during a call. Continue an incomplete matching call,
        // but keep complete explicit calls that reuse an index distinct.
        if (
          this.canContinueToolCall(indexedToolCall, {
            name,
            hasExplicitType,
          })
        ) {
          return indexedToolCall;
        }
      }

      return undefined;
    }

    if (indexedToolCall != null) {
      // A different name or a complete explicit call at the same index
      // indicates a new call from a provider that reuses indices.
      return this.canContinueToolCall(indexedToolCall, {
        name,
        hasExplicitType,
      })
        ? indexedToolCall
        : undefined;
    }

    if (name != null) {
      return undefined;
    }

    const unfinishedToolCalls = this.toolCalls.filter(
      toolCall => !toolCall.hasFinished,
    );
    if (unfinishedToolCalls.length === 1) {
      return unfinishedToolCalls[0];
    }
    return unfinishedToolCalls.length > 1 ? null : undefined;
  }

  private canContinueToolCall(
    toolCall: TrackedToolCall,
    {
      name,
      hasExplicitType,
    }: {
      name: string | undefined;
      hasExplicitType: boolean;
    },
  ): boolean {
    return (
      name == null ||
      (toolCall.function.name === name &&
        (!hasExplicitType || !isParsableJson(toolCall.function.arguments)))
    );
  }

  private validateNewToolCall(toolCallDelta: DELTA): void {
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
      name: string;
    },
  ): TrackedToolCall {
    const id = this.createToolCallId(wireId);

    this.controller.enqueue({
      type: 'tool-input-start',
      id,
      toolName: name,
    });

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
      metadata: this.extractMetadata?.(toolCallDelta),
    };
    this.toolCalls.push(toolCall);
    if (wireId != null) {
      this.associateWireId(toolCall, wireId);
    }

    if (toolCall.function.arguments.length > 0) {
      this.controller.enqueue({
        type: 'tool-input-delta',
        id: toolCall.id,
        delta: toolCall.function.arguments,
      });
    }

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
    if (
      !toolCall.hasFinished &&
      toolCallDelta.function?.arguments != null &&
      toolCallDelta.function.arguments.length > 0
    ) {
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
