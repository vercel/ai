import type { Resolvable, FetchFunction } from '@ai-sdk/provider-utils';

export type RevaiConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  /**
   * Maximum time in milliseconds to wait for an asynchronous transcription job
   * to finish before throwing a `TranscriptionJobPollingTimedOut` error.
   * Defaults to the model catalog value (60000 ms for `machine`).
   */
  pollTimeoutMs?: number;
};
