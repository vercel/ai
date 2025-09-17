import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

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

export const fileSearchArgsSchema = z.object({
  vectorStoreIds: z.array(z.string()).optional(),
  maxNumResults: z.number().optional(),
  ranking: z
    .object({
      ranker: z.enum(['auto', 'default-2024-08-21']).optional(),
    })
    .optional(),
  filters: filtersSchema.optional(),
});

/**
 * A filter used to compare a specified attribute key to a given value using a defined comparison operation.
 */
type ComparisonFilter = {
  /**
   * The key to compare against the value.
   */
  key: string;

  /**
   * Specifies the comparison operator: eq, ne, gt, gte, lt, lte.
   */
  type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

  /**
   * The value to compare against the attribute key; supports string, number, or boolean types.
   */
  value: string | number | boolean;
};

/**
 * Combine multiple filters using and or or.
 */
type CompoundFilter = {
  /**
   * Type of operation: and or or.
   */
  type: 'and' | 'or';

  /**
   * Array of filters to combine. Items can be ComparisonFilter or CompoundFilter.
   */
  filters: Array<ComparisonFilter | CompoundFilter>;
};

export const fileSearch = createProviderDefinedToolFactory<
  {
    /**
     * The search query to execute.
     */
    query: string;
  },
  {
    /**
     * List of vector store IDs to search through.
     */
    vectorStoreIds: string[];

    /**
     * Maximum number of search results to return. Defaults to 10.
     */
    maxNumResults?: number;

    /**
     * Ranking options for the search.
     */
    ranking: {
      /**
       * The ranker to use for the file search.
       */
      ranker?: string;

      /**
       * The score threshold for the file search, a number between 0 and 1.
       * Numbers closer to 1 will attempt to return only the most relevant results,
       * but may return fewer results.
       */
      scoreThreshold?: number;
    };

    /**
     * A filter to apply.
     */
    filters?: ComparisonFilter | CompoundFilter;
  }
>({
  id: 'openai.file_search',
  name: 'file_search',
  inputSchema: z.object({
    query: z.string(),
  }),
});
