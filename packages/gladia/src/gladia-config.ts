import type { Resolvable, FetchFunction } from '@ai-sdk/provider-utils';

export type GladiaConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  /**
   * Interval in milliseconds between transcription job status checks.
   * Defaults to 1000 (1 second).
   */
  pollIntervalMs?: number;
  /**
   * Maximum time in milliseconds to wait for an asynchronous transcription job
   * to finish before throwing a `TranscriptionJobPollingTimedOut` error.
   * Defaults to 600000 (10 minutes).
   */
  pollTimeoutMs?: number;
};
