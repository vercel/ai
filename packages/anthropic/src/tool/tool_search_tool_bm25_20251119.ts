import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const toolSearchToolBm25_20251119ArgsSchema = lazySchema(() =>
  zodSchema(z.object({})),
);

export const toolSearchToolBm25_20251119 = createProviderToolFactory<{}, {}>({
  id: 'anthropic.tool_search_tool_bm25_20251119',
  inputSchema: toolSearchToolBm25_20251119ArgsSchema,
});
