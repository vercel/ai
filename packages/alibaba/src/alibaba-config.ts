import type { Resolvable, FetchFunction } from '@ai-sdk/provider-utils';

export interface AlibabaConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  includeUsage?: boolean;
}
