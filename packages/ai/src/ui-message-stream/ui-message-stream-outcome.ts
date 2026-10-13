/**
 * The operation-level outcome of a UI message stream.
 *
 * This is separate from model finish reasons and individual stream chunks.
 * Fatal stream-processing failures override outcomes declared by the stream
 * owner.
 */
export type UIMessageStreamOutcome =
  | { status: 'completed' }
  | { status: 'failed'; error?: unknown }
  | { status: 'aborted' }
  | { status: 'unknown' };
