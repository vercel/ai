export const AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL = 'aisdk:telemetry';

export type TelemetryDiagnosticEventType =
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
  | 'onError';

export type TelemetryDiagnosticChannelMessage<EVENT = unknown> = {
  readonly type: TelemetryDiagnosticEventType;
  readonly event: EVENT;
};
