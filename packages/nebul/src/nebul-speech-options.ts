/**
 * Nebul speech model ids from the Nebul Model Catalog,
 * https://docs.nebul.io/docs/inference-api/models/text-to-speech
 * retrieved on 2026-09-08. The catalog evolves continuously, so the
 * type allows arbitrary model ids.
 */
export type NebulSpeechModelId =
  | 'ResembleAI/chatterbox-multilingual'
  | (string & {});
