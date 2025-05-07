// Export stream data utilities for custom stream implementations,
// both on the client and server side.
// NOTE: this is experimental / internal and may change without notice
export { getTextFromDataUrl } from './data-url';
export type { DeepPartial } from './deep-partial';
export { isDeepEqualData } from './is-deep-equal-data';
export { parsePartialJson } from './parse-partial-json';
export { cosineSimilarity } from './cosine-similarity';
export { simulateReadableStream } from './simulate-readable-stream';
