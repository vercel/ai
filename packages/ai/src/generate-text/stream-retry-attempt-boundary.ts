import type { SharedV4Warning } from '@ai-sdk/provider';

const streamRetryAttemptBoundarySymbol = Symbol('streamRetryAttemptBoundary');

export type StreamRetryAttemptBoundaryPart = {
  [streamRetryAttemptBoundarySymbol]: true;
  warnings: Array<SharedV4Warning>;
};

export function createStreamRetryAttemptBoundaryPart({
  warnings,
}: {
  warnings: Array<SharedV4Warning>;
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
