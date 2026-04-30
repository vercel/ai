export const AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL = 'aisdk:telemetry';

export type TelemetryDiagnosticEventType =
  | 'onStart'
  | 'onStepStart'
  | 'onLanguageModelCallStart'
  | 'onLanguageModelCallEnd'
  | 'onToolExecutionStart'
  | 'onToolExecutionEnd'
  | 'onChunk'
  | 'onStepFinish'
  | 'onObjectStepStart'
  | 'onObjectStepFinish'
  | 'onEmbedStart'
  | 'onEmbedFinish'
  | 'onRerankStart'
  | 'onRerankFinish'
  | 'onFinish'
  | 'onError';

export type TelemetryDiagnosticChannelMessage<EVENT = unknown> = {
  readonly type: TelemetryDiagnosticEventType;
  readonly event: EVENT;
};
