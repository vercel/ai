export type GatewayTranscriptionModelId =
  | 'fish-audio/transcribe-1'
  | 'fish-audio/transcribe-1-free'
  | 'openai/gpt-4o-mini-transcribe'
  | 'openai/gpt-4o-transcribe'
  | 'openai/gpt-realtime-whisper'
  | 'openai/whisper-1'
  | 'spacexai/grok-stt'
  | (string & {});
