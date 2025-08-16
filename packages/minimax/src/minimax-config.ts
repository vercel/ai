import { FetchFunction } from '@ai-sdk/provider-utils';

export type MinimaxConfig = {
  provider: string;
  url: (options: { path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId?: () => string;
};
