// Public types
export type {
  TelemetryAttributeValue,
  TelemetryAttributes,
  TelemetryEventData,
  TelemetryEvent,
  OperationStartedEvent,
  OperationEndedEvent,
  OperationUpdatedEvent,
  OperationErrorEvent,
  TelemetryHandler,
  TelemetryConfig,
} from './types';
export { createTrace } from './create-trace';
export type { TelemetryTrace } from './create-trace';

// Handler implementations
export { otel } from './handlers/otel-handler';
export { compositeHandler } from './handlers/composite-handler';

// Legacy type (kept for backward compatibility)
export type { TelemetrySettings } from './telemetry-settings';
