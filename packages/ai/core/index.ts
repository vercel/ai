// re-exports:
export { jsonSchema } from '@ai-sdk/ui-utils';
export type { DeepPartial, Schema } from '@ai-sdk/ui-utils';

// directory exports:
export * from './data-stream';
export * from './embed';
export * from './generate-image';
export * from './generate-object';
export * from './generate-text';
export * from './middleware';
export * from './prompt';
export * from './registry';
export * from './tool';
export * from './types';

// util exports:
export { cosineSimilarity } from './util/cosine-similarity';
export { simulateReadableStream } from './util/simulate-readable-stream';
