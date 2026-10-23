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
  authority: number;
  content: string;
  date: string | null;
  rerank_score: number;
  site_icon: string | null;
  site_name: string | null;
  snippet: string;
  summary: string;
  title: string;
  url: string;
}

export interface DeepSeekSearchResponse {
  results: DeepSeekSearchResult[];
}

export type DeepSeekSearchOutput = DeepSeekSearchResponse | DeepSeekToolError;

const questionSchema = z
  .string()
  .refine(
    value => value.trim().length > 0 && Array.from(value).length <= 128,
    'Must contain 1 to 128 Unicode characters and cannot be all whitespace',
  );

const deepseekSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: questionSchema.describe(
        'Web search query, 1 to 128 Unicode characters. Supports site:, -site:, lang:, after:, before:, and quoted phrases.',
      ),
      count: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of results, 1 to 50 (default: 10).'),
      need_content: z
        .boolean()
        .optional()
        .describe('Include available page content (default: false).'),
      ori_question: questionSchema
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
                authority: z.number().int(),
                content: z.string(),
                date: z.string().nullable(),
                rerank_score: z.number(),
                site_icon: z.string().nullable(),
                site_name: z.string().nullable(),
                snippet: z.string(),
                summary: z.string(),
                title: z.string(),
                url: z.string(),
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
