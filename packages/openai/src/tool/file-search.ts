import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod';

export const fileSearch = createProviderDefinedToolFactory<
  {
    /**
     * The search query to execute.
     */
    query: string;
  },
  {
    /**
     * List of vector store IDs to search through. If not provided, searches all available vector stores.
     */
    vectorStoreIds?: string[];

    /**
     * Maximum number of search results to return. Defaults to 10.
     */
    maxResults?: number;

    /**
     * Type of search to perform. Defaults to 'auto'.
     */
    searchType?: 'auto' | 'keyword' | 'semantic';
  }
>({
  id: 'openai.file_search',
  inputSchema: z.object({
    query: z.string(),
  }),
});
