import { FetchFunction } from '@ai-sdk/provider-utils';

export type VeniceAIConfig = {
  provider: string;
  url: (options: { model: string; path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};
