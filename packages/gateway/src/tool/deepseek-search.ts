import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';
import {
  gatewayToolErrorSchema,
  type GatewayToolError,
} from './gateway-tool-error';

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

export type DeepSeekSearchOutput = DeepSeekSearchResponse | GatewayToolError;

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
        .int()
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
                authority: z.number().nullish(),
                content: z.string().nullish(),
                date: z.string().nullish(),
                rerank_score: z.number().nullish(),
                site_icon: z.string().nullish(),
                site_name: z.string().nullish(),
                snippet: z.string().nullish(),
                summary: z.string().nullish(),
                title: z.string().nullish(),
                url: z.string().nullish(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
      gatewayToolErrorSchema(),
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
