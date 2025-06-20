import { z } from 'zod';

type FileSearchArgs = {
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
};

export const fileSearchArgsSchema = z.object({
  vectorStoreIds: z.array(z.string()).optional(),
  maxResults: z.number().optional(),
  searchType: z.enum(['auto', 'keyword', 'semantic']).optional(),
});

export function fileSearch(options: FileSearchArgs = {}): {
  type: 'provider-defined-server';
  id: 'openai.file_search';
  name: 'file_search';
  args: FileSearchArgs;
  inputSchema: z.ZodType<{ query: string }>;
} {
  return {
    type: 'provider-defined-server',
    id: 'openai.file_search',
    name: 'file_search',
    args: {
      vectorStoreIds: options.vectorStoreIds,
      maxResults: options.maxResults,
      searchType: options.searchType,
    },
    inputSchema: z.object({
      query: z.string(),
    }),
  };
}
