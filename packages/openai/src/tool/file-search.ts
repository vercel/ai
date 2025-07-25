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
  maxNumResults: z.number().optional(),

  /**
   * Ranking options for the search.
   */
  ranking: z
    .object({
      ranker: z.enum(['auto', 'keyword', 'semantic']).optional(),
    })
    .optional(),
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
    maxNumResults?: number;

    /**
     * Ranking options for the search.
     */
    ranking?: {
      ranker?: 'auto' | 'keyword' | 'semantic';
    };
  }
>({
  id: 'openai.file_search',
  name: 'file_search',
  inputSchema: z.object({
    query: z.string(),
  }),
});
