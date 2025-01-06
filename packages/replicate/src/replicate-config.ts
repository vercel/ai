import type { Resolvable } from '@ai-sdk/provider-utils';

export interface ReplicateConfig {
  provider: string;
  apiToken: string;
  baseURL?: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}

export function createReplicateConfig(config: Omit<ReplicateConfig, 'provider'>) {
  return {
    ...config,
    provider: 'replicate',
    baseURL: config.baseURL ?? 'https://api.replicate.com/v1',
    headers: {
      ...config.headers,
      'Authorization': `Bearer ${config.apiToken}`,
    },
  };
} 