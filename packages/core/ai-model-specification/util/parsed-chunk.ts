export type ParsedChunk<T> =
  | { type: 'value'; value: T }
  | { type: 'error'; error: unknown };
