// Deepgram TTS voices are addressed by voice family; the upstream model ID
// is composed from the family, the `voice` option, and the `language`
// option (`<family>-<voice>-<language>`, e.g. 'aura-2' + 'thalia' + 'en' →
// 'aura-2-thalia-en'). Full voice list:
// https://developers.deepgram.com/docs/tts-models
export type DeepgramSpeechModelId = 'aura' | 'aura-2' | (string & {});
