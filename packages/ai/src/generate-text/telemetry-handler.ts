import type {
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
    onToolCallStart: impl.onToolCallStart?.bind(impl),
    onToolCallFinish: impl.onToolCallFinish?.bind(impl),
    onStepFinish: impl.onStepFinish?.bind(impl),
    onFinish: impl.onFinish?.bind(impl),
  };
}
