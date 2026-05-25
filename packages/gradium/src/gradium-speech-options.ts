/**
 * Gradium TTS model IDs.
 *
 * `'default'` is the production model; passing any other string forwards
 * it as `model_name` for early-access or A/B-tested models. The
 * `(string & {})` suffix preserves the literal hint while allowing
 * arbitrary strings.
 *
 * @see https://gradium.ai/api_docs.html
 */
export type GradiumSpeechModelId = 'default' | (string & {});
