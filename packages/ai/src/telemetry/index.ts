export type { TelemetryOptions } from './telemetry-options';
export type { InferTelemetryEvent, Telemetry } from './telemetry';
export { registerTelemetry } from './telemetry-registry';
export {
  AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL,
  type TelemetryDiagnosticChannelMessage,
  type TelemetryDiagnosticEventType,
} from './diagnostic-channel';
