import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Args validation schema
export const fileSearchArgsSchema = z.object({
  /**
   * List of vector store IDs to search through. If not provided, searches all available vector stores.
   */
  vectorStoreIds: z.array(z.string()).optional(),

  /**
   * Maximum number of search results to return. Defaults to 10.
   */
  maxResults: z.number().optional(),

  /**
   * Type of search to perform. Defaults to 'auto'.
   */
  searchType: z.enum(['auto', 'keyword', 'semantic']).optional(),
});

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
  name: 'file_search',
  inputSchema: z.object({
    query: z.string(),
  }),
});
