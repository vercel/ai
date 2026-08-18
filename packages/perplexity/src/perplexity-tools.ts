import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const emptyInputSchema = lazySchema(() => zodSchema(z.object({})));
const outputSchema = lazySchema(() => zodSchema(z.unknown()));

const webSearch = createProviderExecutedToolFactory<
  {},
  unknown,
  {
    filters?: {
      searchDomainFilter?: string[];
      searchLanguageFilter?: string[];
      searchRecencyFilter?: 'day' | 'week' | 'month' | 'year';
      searchAfterDate?: string;
      searchBeforeDate?: string;
    };
    searchContextSize?: 'low' | 'medium' | 'high';
    maxResults?: number;
    maxTokens?: number;
    maxTokensPerPage?: number;
    userLocation?: {
      country?: string;
      city?: string;
      region?: string;
      latitude?: number;
      longitude?: number;
    };
  }
>({
  id: 'perplexity.web_search',
  inputSchema: emptyInputSchema,
  outputSchema,
});

const fetchUrl = createProviderExecutedToolFactory<
  {},
  unknown,
  { maxUrls?: number }
>({
  id: 'perplexity.fetch_url',
  inputSchema: emptyInputSchema,
  outputSchema,
});

const financeSearch = createProviderExecutedToolFactory<{}, unknown, {}>({
  id: 'perplexity.finance_search',
  inputSchema: emptyInputSchema,
  outputSchema,
});

const peopleSearch = createProviderExecutedToolFactory<{}, unknown, {}>({
  id: 'perplexity.people_search',
  inputSchema: emptyInputSchema,
  outputSchema,
});

const sandbox = createProviderExecutedToolFactory<{}, unknown, {}>({
  id: 'perplexity.sandbox',
  inputSchema: emptyInputSchema,
  outputSchema,
});

const mcp = createProviderExecutedToolFactory<
  {},
  unknown,
  {
    serverLabel: string;
    serverUrl: string;
    authorization?: string;
    headers?: Record<string, string>;
    allowedTools?: string[];
    deferLoading?: boolean;
  }
>({
  id: 'perplexity.mcp',
  inputSchema: emptyInputSchema,
  outputSchema,
});

export const perplexityTools = {
  webSearch,
  fetchUrl,
  financeSearch,
  peopleSearch,
  sandbox,
  mcp,
};
