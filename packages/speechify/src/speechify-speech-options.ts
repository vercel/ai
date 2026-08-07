export type SpeechifySpeechModelId =
  | 'simba-3.2'
  | 'simba-english'
  | 'simba-multilingual'
  | 'simba-3.0'
  | (string & {});

export type SpeechifySpeechVoiceId = string;

export const SIMBA_3_2_VOICES = [
  'beatrice_32',
  'dominic_32',
  'edmund_32',
  'geffen_32',
  'harper_32',
  'hugh_32',
  'imogen_32',
  'wyatt_32',
] as const;

export type Simba32Voice = (typeof SIMBA_3_2_VOICES)[number];
