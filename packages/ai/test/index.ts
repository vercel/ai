export {
  convertArrayToAsyncIterable,
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
export { MockEmbeddingModelV2 } from '../src/test/mock-embedding-model-v2';
export { MockImageModelV2 } from '../src/test/mock-image-model-v2';
export { MockLanguageModelV2 } from '../src/test/mock-language-model-v2';
export { MockProviderV2 } from '../src/test/mock-provider-v2';
export { MockSpeechModelV2 } from '../src/test/mock-speech-model-v2';
export { MockTranscriptionModelV2 } from '../src/test/mock-transcription-model-v2';
export { mockValues } from '../src/test/mock-values';

import { simulateReadableStream as originalSimulateReadableStream } from '../src/util/simulate-readable-stream';

/**
 * @deprecated Use `simulateReadableStream` from `ai` instead.
 */
export const simulateReadableStream = originalSimulateReadableStream;
