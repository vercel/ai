import type { Resolvable } from '@ai-sdk/provider-utils';

export interface ReplicateConfig {
  provider: string;
  apiToken: string;
  baseURL?: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}
