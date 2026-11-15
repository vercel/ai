import type { Resolvable, FetchFunction } from '@ai-sdk/provider-utils';

export type AssemblyAIConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
};
