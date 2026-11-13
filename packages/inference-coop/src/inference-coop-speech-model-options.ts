// Speaker IDs reported by the gateway when an invalid voice is passed
// (verified against https://gateway.inference.coop/v1/audio/speech, 2026-11).
// The language prefixes follow the voice they translate (fr/de/es/it/pt/nl/hi).
export type InferenceCoopSpeechVoice =
  | 'ar_male'
  | 'casual_female'
  | 'casual_male'
  | 'cheerful_female'
  | 'de_female'
  | 'de_male'
  | 'es_female'
  | 'es_male'
  | 'fr_female'
  | 'fr_male'
  | 'hi_female'
  | 'hi_male'
  | 'it_female'
  | 'it_male'
  | 'neutral_female'
  | 'neutral_male'
  | 'nl_female'
  | 'nl_male'
  | 'pt_female'
  | 'pt_male'
  | (string & {});

// Catalog: https://gateway.inference.coop/v1/models
export type InferenceCoopSpeechModelId = 'tinfoil/voxtral-tts' | (string & {});

export type InferenceCoopSpeechModelOptions = Record<string, never>;
