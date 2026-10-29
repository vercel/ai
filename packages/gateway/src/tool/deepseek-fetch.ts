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

export interface DeepSeekFetchConfig {
  /** Pin the target URL instead of allowing the model to choose it. */
  url?: string;
}

export interface DeepSeekFetchInput {
  url: string;
}

export interface DeepSeekFetchResponse {
  title?: string | null;
  /** Page content as Markdown. */
  content: string;
}

export type DeepSeekFetchOutput = DeepSeekFetchResponse | DeepSeekToolError;

const deepseekFetchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      url: z
        .string()
        .describe(
          'URL to fetch, at most 8192 characters; HTTP(S) only, without a username or password.',
        ),
    }),
  ),
);

const deepseekFetchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z
        .object({
          title: z.string().nullish().catch(undefined),
          content: z.string(),
        })
        .passthrough(),
      deepseekToolErrorSchema,
    ]),
  ),
);

export const deepseekFetchToolFactory = createProviderExecutedToolFactory<
  DeepSeekFetchInput,
  DeepSeekFetchOutput,
  DeepSeekFetchConfig
>({
  id: 'gateway.deepseek_fetch',
  inputSchema: deepseekFetchInputSchema,
  outputSchema: deepseekFetchOutputSchema,
});

export const deepseekFetch = (
  config: DeepSeekFetchConfig = {},
): ReturnType<typeof deepseekFetchToolFactory> =>
  deepseekFetchToolFactory(config);
