export type GatewayTranscriptionModelId =
  | 'fish-audio/transcribe-1'
  | 'google/gemini-3.5-transcribe'
  | 'google/gemini-3.5-transcribe-live'
  | 'openai/gpt-4o-mini-transcribe'
  | 'openai/gpt-4o-transcribe'
  | 'openai/gpt-realtime-whisper'
  | 'openai/whisper-1'
  | 'spacexai/grok-stt'
  | (string & {});
