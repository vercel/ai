import {
  createProviderExecutedToolFactory,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const factory = createProviderExecutedToolFactory<
  Record<string, never>,
  unknown,
  Record<string, never>
>({
  id: 'mistral.web_search_premium',
  inputSchema: zodSchema(z.object({})),
  outputSchema: zodSchema(z.unknown()),
});

export const webSearchPremium = (args: Parameters<typeof factory>[0] = {}) =>
  factory(args);
