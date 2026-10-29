import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';
import {
  deepseekToolErrorSchema,
  type DeepSeekToolError,
} from './deepseek-tool-error';

export interface DeepSeekSearchConfig {
  /** Pin the query instead of allowing the model to choose it. */
  query?: string;
  /** Maximum number of results, 1–50 (default: 10). */
  count?: number;
  /** Include available page content (default: false). */
  needContent?: boolean;
  /** Original question, 1–128 Unicode characters; null means absent. */
  oriQuestion?: string | null;
  /** Developer-configured IP address for result localization. */
  localization?: string;
}

export interface DeepSeekSearchInput {
  query: string;
  count?: number;
  need_content?: boolean;
  ori_question?: string | null;
}

export interface DeepSeekSearchResult {
  authority?: number | null;
  content?: string | null;
  date?: string | null;
  rerank_score?: number | null;
  site_icon?: string | null;
  site_name?: string | null;
  snippet?: string | null;
  summary?: string | null;
  title?: string | null;
  url?: string | null;
}

export interface DeepSeekSearchResponse {
  results: DeepSeekSearchResult[];
}

export type DeepSeekSearchOutput = DeepSeekSearchResponse | DeepSeekToolError;

const deepseekSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z
        .string()
        .describe(
          'Web search query, 1 to 128 Unicode characters. Supports site:, -site:, lang:, after:, before:, and quoted phrases.',
        ),
      count: z
        .number()
        .optional()
        .describe('Number of results, 1 to 50 (default: 10).'),
      need_content: z
        .boolean()
        .optional()
        .describe('Include available page content (default: false).'),
      ori_question: z
        .string()
        .nullable()
        .optional()
        .describe('Original user question, 1 to 128 Unicode characters.'),
    }),
  ),
);

const deepseekSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z
        .object({
          results: z.array(
            z
              .object({
                authority: z.number().nullish().catch(undefined),
                content: z.string().nullish().catch(undefined),
                date: z.string().nullish().catch(undefined),
                rerank_score: z.number().nullish().catch(undefined),
                site_icon: z.string().nullish().catch(undefined),
                site_name: z.string().nullish().catch(undefined),
                snippet: z.string().nullish().catch(undefined),
                summary: z.string().nullish().catch(undefined),
                title: z.string().nullish().catch(undefined),
                url: z.string().nullish().catch(undefined),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
      deepseekToolErrorSchema,
    ]),
  ),
);

export const deepseekSearchToolFactory = createProviderExecutedToolFactory<
  DeepSeekSearchInput,
  DeepSeekSearchOutput,
  DeepSeekSearchConfig
>({
  id: 'gateway.deepseek_search',
  inputSchema: deepseekSearchInputSchema,
  outputSchema: deepseekSearchOutputSchema,
});

export const deepseekSearch = (
  config: DeepSeekSearchConfig = {},
): ReturnType<typeof deepseekSearchToolFactory> =>
  deepseekSearchToolFactory(config);
