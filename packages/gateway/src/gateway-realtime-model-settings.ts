export type GatewayRealtimeModelId =
  | 'elevenlabs/eleven-realtime-v1-max'
  | 'elevenlabs/eleven-realtime-v1-mini'
  | 'google/gemini-3.8-live'
  | 'google/gemini-3.8-live-extended-thinking'
  | 'openai/gpt-live-1'
  | 'openai/gpt-realtime-1.5'
  | 'openai/gpt-realtime-2'
  | 'openai/gpt-realtime-2.1'
  | 'openai/gpt-realtime-mini'
  | 'spacexai/grok-voice-3.0'
  | 'spacexai/grok-voice-think-fast-2.0'
  | (string & {});
