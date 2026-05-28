export const AI_SDK_TELEMETRY_TRACING_CHANNEL = 'aisdk:telemetry';

export type TelemetryTracingEventType =
  | 'onStart'
  | 'onStepStart'
  | 'onLanguageModelCallStart'
  | 'onLanguageModelCallEnd'
  | 'onToolExecutionStart'
  | 'onToolExecutionEnd'
  | 'onStepFinish'
  | 'onObjectStepStart'
  | 'onObjectStepFinish'
  | 'onEmbedStart'
  | 'onEmbedEnd'
  | 'onRerankStart'
  | 'onRerankEnd'
  | 'onEnd'
  | 'onAbort'
  | 'onError'
  | 'executeLanguageModelCall'
  | 'executeTool';

export type TelemetryTracingChannelMessage<EVENT = unknown> = {
  readonly type: TelemetryTracingEventType;
  readonly event: EVENT;
};
