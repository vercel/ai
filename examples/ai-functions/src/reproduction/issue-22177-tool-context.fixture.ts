import { MockLanguageModelV4 } from 'ai/test';
import { ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';

const getAppMetadata = tool({
  description: 'Get app metadata',
  inputSchema: z.object({}),
  contextSchema: z.object({
    storefront: z.string(),
    appStoreId: z.string(),
  }),
  execute: async (_input, { context }) => ({
    storefront: context.storefront,
    appStoreId: context.appStoreId,
  }),
});

const agent = new ToolLoopAgent({
  model: new MockLanguageModelV4(),
  tools: { getAppMetadata },
});

void agent.generate({
  prompt: 'Find the metadata for this app.',
  toolsContext: {
    getAppMetadata: { storefront: 'nl', appStoreId: '1234567890' },
  },
});

void agent.stream({
  prompt: 'Find the metadata for this app.',
  toolsContext: {
    getAppMetadata: { storefront: 'nl', appStoreId: '1234567890' },
  },
});
