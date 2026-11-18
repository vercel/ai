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

export type DeepSeekFetchOutput = DeepSeekFetchResponse | GatewayToolError;

const deepseekFetchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      url: z.describe(
        z.string(),
        'URL to fetch, at most 8192 characters; HTTP(S) only, without a username or password.',
      ),
    }),
  ),
);

const deepseekFetchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.catchall(
        z.object({
          title: z.nullish(z.string()),
          content: z.string(),
        }),
        z.unknown(),
      ),
      gatewayToolErrorSchema(),
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
