import type {
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
} from '../generate-text/callback-events';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import type { TelemetryHandler } from './telemetry-handler';

/**
 * Wraps a telemetry handler implementation with bound methods.
 * Use this when creating class-based handlers to ensure methods
 * work correctly when passed as callbacks.
 */
export function bindTelemetryHandler<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(handler: TelemetryHandler<TOOLS, OUTPUT>): TelemetryHandler<TOOLS, OUTPUT> {
  return {
    onStart: handler.onStart?.bind(handler),
    onStepStart: handler.onStepStart?.bind(handler),
    onToolCallStart: handler.onToolCallStart?.bind(handler),
    onToolCallFinish: handler.onToolCallFinish?.bind(handler),
    onStepFinish: handler.onStepFinish?.bind(handler),
    onFinish: handler.onFinish?.bind(handler),
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
 * Expands telemetry handlers into individual listener functions.
 * Each returned listener fans out to all handlers that implement that event.
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
      onToolCallStart: undefined,
      onToolCallFinish: undefined,
      onStepFinish: undefined,
      onFinish: undefined,
    };
  }

  const handlerList = (Array.isArray(handlers)
    ? handlers
    : [handlers]) as unknown as Array<TelemetryHandler<TOOLS, OUTPUT>>;

  /**
   * Creates a single callback that broadcasts an event to every handler
   * that implements the given lifecycle method. Returns undefined when
   * no handler implements the method (so `notify` can skip it).
   */
  function createBroadcastListener<EVENT>(
    getListenerFromHandler: (
      handler: TelemetryHandler<TOOLS, OUTPUT>,
    ) => ((event: EVENT) => PromiseLike<void> | void) | undefined,
  ): ((event: EVENT) => Promise<void>) | undefined {
    const listeners = handlerList
      .map(getListenerFromHandler)
      .filter(Boolean) as Array<(event: EVENT) => PromiseLike<void> | void>;

    if (listeners.length === 0) return undefined;

    return async (event: EVENT) => {
      for (const listener of listeners) {
        try {
          await listener(event);
        } catch (_ignored) {}
      }
    };
  }

  return {
    onStart: createBroadcastListener(handler => handler.onStart),
    onStepStart: createBroadcastListener(handler => handler.onStepStart),
    onToolCallStart: createBroadcastListener(
      handler => handler.onToolCallStart,
    ),
    onToolCallFinish: createBroadcastListener(
      handler => handler.onToolCallFinish,
    ),
    onStepFinish: createBroadcastListener(handler => handler.onStepFinish),
    onFinish: createBroadcastListener(handler => handler.onFinish),
  };
}
