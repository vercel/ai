export {
  convertArrayToAsyncIterable,
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
export { MockEmbeddingModelV3 } from '../src/test/mock-embedding-model-v3';
export { MockImageModelV3 } from '../src/test/mock-image-model-v3';
export { MockLanguageModelV3 } from '../src/test/mock-language-model-v3';
export { MockProviderV3 } from '../src/test/mock-provider-v3';
export { MockSpeechModelV2 } from '../src/test/mock-speech-model-v2';
export { MockTranscriptionModelV3 } from '../src/test/mock-transcription-model-v3';
export { mockValues } from '../src/test/mock-values';

import { simulateReadableStream as originalSimulateReadableStream } from '../src/util/simulate-readable-stream';

/**
 * @deprecated Use `simulateReadableStream` from `ai` instead.
 */
export const simulateReadableStream = originalSimulateReadableStream;
