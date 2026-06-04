export const AI_SDK_TELEMETRY_TRACING_CHANNEL = 'aisdk:telemetry';

export type TelemetryTracingEventType =
  | 'generateText'
  | 'step'
  | 'languageModelCall'
  | 'executeTool'
  | 'embed'
  | 'rerank';

export type TelemetryTracingChannelMessage<EVENT = unknown> = {
  readonly type: TelemetryTracingEventType;
  readonly event: EVENT;
};
