/**
 * Gradium STT model IDs.
 *
 * `'default'` is the production model; any other string is forwarded as
 * the `?model=` query parameter for early-access or A/B-tested models.
 *
 * @see https://api.gradium.ai/api/post/speech/asr
 */
export type GradiumTranscriptionModelId = 'default' | (string & {});
