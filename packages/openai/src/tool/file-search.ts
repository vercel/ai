import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Filter schemas
const comparisonFilterSchema = z.object({
  key: z.string(),
  type: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const compoundFilterSchema: z.ZodType<any> = z.object({
  type: z.enum(['and', 'or']),
  filters: z.array(
    z.union([comparisonFilterSchema, z.lazy(() => compoundFilterSchema)]),
  ),
});

const filtersSchema = z.union([comparisonFilterSchema, compoundFilterSchema]);

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
      ranker: z.enum(['auto', 'default-2024-08-21']).optional(),
    })
    .optional(),

  /**
   * A filter to apply based on file attributes.
   */
  filters: filtersSchema.optional(),
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
      ranker?: 'auto' | 'default-2024-08-21';
    };

    /**
     * A filter to apply based on file attributes.
     */
    filters?:
      | {
          key: string;
          type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
          value: string | number | boolean;
        }
      | {
          type: 'and' | 'or';
          filters: any[];
        };
  }
>({
  id: 'openai.file_search',
  name: 'file_search',
  inputSchema: z.object({
    query: z.string(),
  }),
});
