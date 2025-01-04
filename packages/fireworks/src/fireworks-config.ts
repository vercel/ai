import { FetchFunction } from '@ai-sdk/provider-utils';

export type FireworksConfig = {
  provider: string;
  url: ({ path }: { path: string }) => string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
};
