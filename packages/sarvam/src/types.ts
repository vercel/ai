/**
 * Sarvam AI model IDs for chat completions.
 * @see https://docs.sarvam.ai/api-reference-docs/getting-started/quickstart
 */
export type SarvamChatModelId =
  | 'sarvam-m'
  | 'sarvam-30b'
  | 'sarvam-30b-16k'
  | 'sarvam-105b'
  | 'sarvam-105b-32k'
  | (string & {});
