export {
  convertArrayToAsyncIterable,
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
export { MockEmbeddingModelV2 } from '../core/test/mock-embedding-model-v2';
export { MockLanguageModelV2 } from '../core/test/mock-language-model-v2';
export { mockValues } from '../core/test/mock-values';

import { simulateReadableStream as originalSimulateReadableStream } from '../src/util/simulate-readable-stream';

/**
 * @deprecated Use `simulateReadableStream` from `ai` instead.
 */
export const simulateReadableStream = originalSimulateReadableStream;
