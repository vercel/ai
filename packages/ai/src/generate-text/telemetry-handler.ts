import type {
  OnChunkEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
} from './callback-events';
import type { Output } from './output';
import type { ToolSet } from './tool-set';

/**
 * Interface for telemetry handlers.
 *
 * Implement this interface to create custom telemetry integrations
 * (e.g., OpenTelemetry, logging, analytics).
 */
export interface TelemetryHandler<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> {
  onStart?(event: OnStartEvent<TOOLS, OUTPUT>): PromiseLike<void> | void;
  onStepStart?(
    event: OnStepStartEvent<TOOLS, OUTPUT>,
  ): PromiseLike<void> | void;
  onChunk?(event: OnChunkEvent): PromiseLike<void> | void;
  onToolCallStart?(
    event: OnToolCallStartEvent<TOOLS>,
  ): PromiseLike<void> | void;
  onToolCallFinish?(
    event: OnToolCallFinishEvent<TOOLS>,
  ): PromiseLike<void> | void;
  onStepFinish?(event: OnStepFinishEvent<TOOLS>): PromiseLike<void> | void;
  onFinish?(event: OnFinishEvent<TOOLS>): PromiseLike<void> | void;
}

/**
 * Wraps a telemetry handler implementation with bound methods.
 * Use this when creating handlers to ensure methods work correctly
 * when passed as callbacks.
 */
export function bindTelemetryHandler<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(impl: TelemetryHandler<TOOLS, OUTPUT>): TelemetryHandler<TOOLS, OUTPUT> {
  return {
    onStart: impl.onStart?.bind(impl),
    onStepStart: impl.onStepStart?.bind(impl),
    onChunk: impl.onChunk?.bind(impl),
    onToolCallStart: impl.onToolCallStart?.bind(impl),
    onToolCallFinish: impl.onToolCallFinish?.bind(impl),
    onStepFinish: impl.onStepFinish?.bind(impl),
    onFinish: impl.onFinish?.bind(impl),
  };
}

export interface ExpandedTelemetryListeners<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> {
  onStart: ((event: OnStartEvent<TOOLS, OUTPUT>) => Promise<void>) | undefined;
  onStepStart:
    | ((event: OnStepStartEvent<TOOLS, OUTPUT>) => Promise<void>)
    | undefined;
  onChunk: ((event: OnChunkEvent) => Promise<void>) | undefined;
  onToolCallStart:
    | ((event: OnToolCallStartEvent<TOOLS>) => Promise<void>)
    | undefined;
  onToolCallFinish:
    | ((event: OnToolCallFinishEvent<TOOLS>) => Promise<void>)
    | undefined;
  onStepFinish:
    | ((event: OnStepFinishEvent<TOOLS>) => Promise<void>)
    | undefined;
  onFinish: ((event: OnFinishEvent<TOOLS>) => Promise<void>) | undefined;
}

/**
 * Expands an array of telemetry handlers into individual listener functions.
 * Each returned listener fans out to all handlers that implement that event.
 *
 * The generic parameters allow the returned listeners to be typed for the
 * specific TOOLS/OUTPUT used at the call site. This is safe because
 * TelemetryHandler<ToolSet> methods accept the base ToolSet events,
 * and specific TOOLS events (where TOOLS extends ToolSet) are structurally
 * compatible — a handler that processes ToolSet events can process any
 * subtype's events.
 */
export function expandHandlers<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(
  handlers: TelemetryHandler | Array<TelemetryHandler> | undefined,
): ExpandedTelemetryListeners<TOOLS, OUTPUT> {
  if (handlers == null) {
    return {
      onStart: undefined,
      onStepStart: undefined,
      onChunk: undefined,
      onToolCallStart: undefined,
      onToolCallFinish: undefined,
      onStepFinish: undefined,
      onFinish: undefined,
    };
  }

  // Safe cast: TelemetryHandler<ToolSet> can handle events for any
  // TOOLS extends ToolSet, since the event types only add specificity
  // to tool-related fields that the base handler reads as ToolSet.
  const arr = (Array.isArray(handlers)
    ? handlers
    : [handlers]) as unknown as Array<TelemetryHandler<TOOLS, OUTPUT>>;

  function createFanOut<E>(
    extract: (
      h: TelemetryHandler<TOOLS, OUTPUT>,
    ) => ((event: E) => PromiseLike<void> | void) | undefined,
  ): ((event: E) => Promise<void>) | undefined {
    const fns = arr.map(extract).filter(Boolean) as Array<
      (event: E) => PromiseLike<void> | void
    >;
    if (fns.length === 0) return undefined;
    return async (event: E) => {
      for (const fn of fns) {
        try {
          await fn(event);
        } catch (_ignored) {}
      }
    };
  }

  return {
    onStart: createFanOut(h => h.onStart),
    onStepStart: createFanOut(h => h.onStepStart),
    onChunk: createFanOut(h => h.onChunk),
    onToolCallStart: createFanOut(h => h.onToolCallStart),
    onToolCallFinish: createFanOut(h => h.onToolCallFinish),
    onStepFinish: createFanOut(h => h.onStepFinish),
    onFinish: createFanOut(h => h.onFinish),
  };
}
