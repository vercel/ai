export type ElevenLabsSpeechModelId =
  | 'eleven_v4'
  | 'eleven_v4_turbo'
  | 'eleven_v3'
  | 'eleven_v3_conversational'
  | 'eleven_multilingual_v2'
  | 'eleven_flash_v2_5'
  | 'eleven_flash_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_turbo_v2'
  | 'eleven_monolingual_v1'
  | 'eleven_multilingual_v1'
  | 'music_v2_5'
  | 'music_v2'
  | 'music_v1'
  | 'eleven_text_to_sound_v2'
  | 'eleven_text_to_sound_v3'
  | (string & {});

export type ElevenLabsSpeechVoiceId = string;
