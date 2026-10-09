import type { ExecuteToolsStreamPart } from './execute-tools-from-stream';
import type { StreamRetryAttemptBoundaryPart } from './stream-retry-attempt-boundary';

// Chunk types that contain semantic model output. This classification is used
// for first-content and inter-content timeouts as well as to distinguish empty
// incomplete streams from incomplete streams with partial results. It is
// exhaustive so that new chunk types must be classified explicitly.
const isOutputChunkType = {
  file: true,
  custom: false,
  source: false,
  'text-start': false,
  'text-end': false,
  'text-delta': true,
  'reasoning-start': false,
  'reasoning-end': false,
  'reasoning-delta': true,
  'reasoning-file': true,
  'tool-input-start': false,
  'tool-input-end': false,
  'tool-input-delta': true,
  'tool-approval-request': false,
  'tool-approval-response': false,
  'tool-call': true,
  'tool-result': false,
  'tool-error': false,
  'tool-output-denied': false,
  'tool-execution-end': false,
  'model-call-start': false,
  'model-call-response-metadata': false,
  'model-call-end': false,
  error: false,
  raw: false,
} as const satisfies Record<
  Exclude<ExecuteToolsStreamPart, StreamRetryAttemptBoundaryPart>['type'],
  boolean
>;

export function isOutputChunk(
  chunk: Exclude<ExecuteToolsStreamPart, StreamRetryAttemptBoundaryPart>,
): boolean {
  if (!isOutputChunkType[chunk.type]) {
    return false;
  }

  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return chunk.text.length > 0;
    case 'tool-input-delta':
      return chunk.delta.length > 0;
    case 'file':
    case 'reasoning-file':
    case 'tool-call':
      return true;
    default:
      return false;
  }
}
