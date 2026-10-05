export const AI_SDK_TELEMETRY_TRACING_CHANNEL = 'ai:telemetry';

export type TelemetryTracingEventType =
  | 'generateText'
  | 'streamText'
  | 'step'
  | 'languageModelCall'
  | 'executeTool'
  | 'embed'
  | 'embedMany'
  | 'rerank'
  | 'generateSpeech'
  | 'transcribe'
  | 'streamTranscribe'
  | 'experimental_evaluate';

export type TelemetryTracingChannelMessage<EVENT = unknown> = {
  readonly type: TelemetryTracingEventType;
  readonly event: EVENT;
};
