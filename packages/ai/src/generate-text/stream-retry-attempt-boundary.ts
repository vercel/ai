import type { CallWarning } from '../types';

const streamRetryAttemptBoundarySymbol = Symbol('streamRetryAttemptBoundary');

export type StreamRetryAttemptBoundaryPart = {
  [streamRetryAttemptBoundarySymbol]: true;
  warnings: Array<CallWarning>;
};

export function createStreamRetryAttemptBoundaryPart({
  warnings,
}: {
  warnings: Array<CallWarning>;
}): StreamRetryAttemptBoundaryPart {
  return {
    [streamRetryAttemptBoundarySymbol]: true,
    warnings,
  };
}

export function isStreamRetryAttemptBoundaryPart(
  part: unknown,
): part is StreamRetryAttemptBoundaryPart {
  return (
    typeof part === 'object' &&
    part != null &&
    streamRetryAttemptBoundarySymbol in part
  );
}
