// Public types
export type {
  TelemetryAttributeValue,
  TelemetryAttributes,
  TelemetryEvent,
  OperationStartedEvent,
  OperationEndedEvent,
  OperationUpdatedEvent,
  OperationErrorEvent,
  TelemetryHandler,
  TelemetryConfig,
  ModelData,
  CallSettingsData,
  ResponseData,
  UsageData,
  GenerateTextStartData,
  GenerateTextResultData,
  DoGenerateStartData,
  DoGenerateResultData,
  ToolCallStartData,
  ToolCallResultData,
  StartDataMap,
  ResultDataMap,
  KnownOperationName,
  CommonStartData,
  CommonResultData,
  InjectedFields,
  BaseStartedEvent,
  BaseUpdatedEvent,
  BaseEndedEvent,
} from './types';
export { createTrace } from './create-trace';
export type { TelemetryTrace } from './create-trace';

// Handler implementations
export { otel } from './handlers/otel-handler';
export { compositeHandler } from './handlers/composite-handler';

// Legacy type (kept for backward compatibility)
export type { TelemetrySettings } from './telemetry-settings';
