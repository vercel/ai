// Deepgram TTS voices are addressed by voice family; the upstream model ID
// is composed from the family, the `voice` option, and the `language`
// option (`<family>-<voice>-<language>`, e.g. 'aura-2' + 'thalia' + 'en' →
// 'aura-2-thalia-en', 'flux' + 'haley' + 'en' → 'flux-haley-en'). Full voice
// lists: https://developers.deepgram.com/docs/tts-models (Aura) and
// https://developers.deepgram.com/docs/flux-tts/voices (Flux TTS).
export type DeepgramSpeechModelId = 'aura' | 'aura-2' | 'flux' | (string & {});
