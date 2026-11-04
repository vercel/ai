/**
 * The operation-level outcome of a UI message stream.
 *
 * This is separate from model finish reasons and individual stream chunks.
 * Fatal stream-processing failures override outcomes declared by the stream
 * owner.
 *
 * Consumer cancellation before an outcome is declared keeps the `unknown`
 * status and is reported separately through the end callback's `isCancelled`
 * property.
 */
export type UIMessageStreamOutcome =
  | { status: 'completed' }
  | { status: 'failed'; error?: unknown }
  | { status: 'aborted' }
  | { status: 'unknown' };
