export const AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL = 'aisdk:telemetry';

export type TelemetryDiagnosticEventType =
  | 'onStart'
  | 'onStepStart'
  | 'onLanguageModelCallStart'
  | 'onLanguageModelCallEnd'
  | 'onToolExecutionStart'
  | 'onToolExecutionEnd'
  | 'onStepEnd'
  | 'onStepFinish'
  | 'onObjectStepStart'
  | 'onObjectStepEnd'
  | 'onEmbedStart'
  | 'onEmbedEnd'
  | 'onRerankStart'
  | 'onRerankEnd'
  | 'onEnd'
  | 'onAbort'
  | 'onError';

export type TelemetryDiagnosticChannelMessage<EVENT = unknown> = {
  readonly type: TelemetryDiagnosticEventType;
  readonly event: EVENT;
};
