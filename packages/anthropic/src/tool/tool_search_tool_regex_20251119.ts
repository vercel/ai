import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const toolSearchToolRegex_20251119ArgsSchema = lazySchema(() =>
  zodSchema(z.object({})),
);

export const toolSearchToolRegex_20251119 = createProviderToolFactory<{}, {}>({
  id: 'anthropic.tool_search_tool_regex_20251119',
  inputSchema: toolSearchToolRegex_20251119ArgsSchema,
});
