import { tool } from 'ai';
import { z } from 'zod/v4';

export const lookupUnionTool = tool({
  description: 'Look up an item by ID or search for items.',
  inputSchema: z.discriminatedUnion('action', [
    z.object({ action: z.literal('lookup'), id: z.string() }),
    z.object({ action: z.literal('search'), query: z.string() }),
  ]),
  execute: async input => {
    console.log('Tool received original input:', input);
    return input.action === 'lookup'
      ? { id: input.id, title: 'Example item' }
      : [{ id: '123', title: input.query }];
  },
});
