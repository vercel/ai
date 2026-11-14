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
      query: z.describe(
        z.string(),
        'Web search query, 1 to 128 Unicode characters. Supports site:, -site:, lang:, after:, before:, and quoted phrases.',
      ),
      count: z.describe(
        z.optional(z.number().check(z.int())),
        'Number of results, 1 to 50 (default: 10).',
      ),
      need_content: z.describe(
        z.optional(z.boolean()),
        'Include available page content (default: false).',
      ),
      ori_question: z.describe(
        z.optional(z.nullable(z.string())),
        'Original user question, 1 to 128 Unicode characters.',
      ),
    }),
  ),
);

const deepseekSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.catchall(
        z.object({
          results: z.array(
            z.catchall(
              z.object({
                authority: z.nullish(z.number()),
                content: z.nullish(z.string()),
                date: z.nullish(z.string()),
                rerank_score: z.nullish(z.number()),
                site_icon: z.nullish(z.string()),
                site_name: z.nullish(z.string()),
                snippet: z.nullish(z.string()),
                summary: z.nullish(z.string()),
                title: z.nullish(z.string()),
                url: z.nullish(z.string()),
              }),
              z.unknown(),
            ),
          ),
        }),
        z.unknown(),
      ),
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
