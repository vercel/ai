export {
  convertArrayToReadableStream,
  mockId,
} from '@ai-sdk/provider-utils/test';
export { MockEmbeddingModelV1 } from '../core/test/mock-embedding-model-v1';
export { MockLanguageModelV2 } from '../core/test/mock-language-model-v1';
export { mockValues } from '../core/test/mock-values';

import { simulateReadableStream as originalSimulateReadableStream } from '../core/util/simulate-readable-stream';

/**
 * @deprecated Use `simulateReadableStream` from `ai` instead.
 */
export const simulateReadableStream = originalSimulateReadableStream;
