import type {
  TelemetryHandler,
  OperationStartedEvent,
  OperationEndedEvent,
  OperationUpdatedEvent,
  OperationErrorEvent,
} from '../types';
import { noopHandler } from './noop-handler';

/**
 * Composes multiple telemetry handlers into a single handler.
 *
 * Each event is forwarded to all handlers in order.
 */
export function compositeHandler(
  ...handlers: TelemetryHandler[]
): TelemetryHandler {
  if (handlers.length === 0) return noopHandler;
  if (handlers.length === 1) return handlers[0];

  return {
    onOperationStarted(event: OperationStartedEvent) {
      for (const handler of handlers) {
        handler.onOperationStarted?.(event);
      }
    },

    onOperationEnded(event: OperationEndedEvent) {
      for (const handler of handlers) {
        handler.onOperationEnded?.(event);
      }
    },

    onOperationUpdated(event: OperationUpdatedEvent) {
      for (const handler of handlers) {
        handler.onOperationUpdated?.(event);
      }
    },

    onOperationError(event: OperationErrorEvent) {
      for (const handler of handlers) {
        handler.onOperationError?.(event);
      }
    },

    async shutdown() {
      await Promise.all(handlers.map(handler => handler.shutdown?.()));
    },
  };
}
