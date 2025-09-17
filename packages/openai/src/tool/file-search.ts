import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import {
  OpenAIResponsesFileSearchToolComparisonFilter,
  OpenAIResponsesFileSearchToolCompoundFilter,
} from '../responses/openai-responses-api-types';
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

export const fileSearchArgsSchema = z.object({
  vectorStoreIds: z.array(z.string()),
  maxNumResults: z.number().optional(),
  ranking: z
    .object({
      ranker: z.string().optional(),
      scoreThreshold: z.number().optional(),
    })
    .optional(),
  filters: z.union([comparisonFilterSchema, compoundFilterSchema]).optional(),
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
    ranking?: {
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
    filters?:
      | OpenAIResponsesFileSearchToolComparisonFilter
      | OpenAIResponsesFileSearchToolCompoundFilter;
  }
>({
  id: 'openai.file_search',
  name: 'file_search',
  inputSchema: z.object({
    query: z.string(),
  }),
});
