import { FetchFunction } from '@ai-sdk/provider-utils';

export type OpenResponsesConfig = {
    provider: string;
    baseURL: string;
    headers: () => Record<string, string | undefined>;
    fetch?: FetchFunction;
    generateId: () => string;
  };
