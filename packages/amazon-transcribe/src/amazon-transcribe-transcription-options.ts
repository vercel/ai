/**
 * Amazon Transcribe does not expose distinct named models for batch
 * transcription; behavior is controlled through provider options (language,
 * settings, custom language models, etc.).
 *
 * Use `'default'` for the standard batch transcription engine. A custom
 * Amazon Transcribe language model name can also be supplied.
 */
export type AmazonTranscribeTranscriptionModelId = 'default' | (string & {});
