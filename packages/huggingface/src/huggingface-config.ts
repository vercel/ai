import { type Resolvable, type FetchFunction } from '@ai-sdk/provider-utils';

export type HuggingFaceConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
};
