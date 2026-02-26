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

/**
 * Implement this interface to create custom telemetry integrations
 * Methods can be sync or return a PromiseLike.
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
