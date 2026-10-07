import type { JSONValue } from '@ai-sdk/provider';
import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const inputSchema = lazySchema(() =>
  zodSchema(z.object({ arguments: z.string() })),
);
const outputSchema = lazySchema(() =>
  zodSchema(z.object({ info: z.record(z.string(), z.json()).optional() })),
);

const webSearchFactory = createProviderExecutedToolFactory<
  { arguments: string },
  { info?: Record<string, JSONValue> },
  {}
>({ id: 'mistral.web_search', inputSchema, outputSchema });

const webSearchPremiumFactory = createProviderExecutedToolFactory<
  { arguments: string },
  { info?: Record<string, JSONValue> },
  {}
>({ id: 'mistral.web_search_premium', inputSchema, outputSchema });

/** Search the web using Mistral's Conversations API. */
export const webSearch = (args: Parameters<typeof webSearchFactory>[0] = {}) =>
  webSearchFactory(args);

/** Search the web and verified news using Mistral's Conversations API. */
export const webSearchPremium = (
  args: Parameters<typeof webSearchPremiumFactory>[0] = {},
) => webSearchPremiumFactory(args);
