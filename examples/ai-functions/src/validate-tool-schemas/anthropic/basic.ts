import { experimental_validateAnthropicToolSchemas as validateToolSchemas } from '@ai-sdk/anthropic';
import { tool } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

// No API key needed. To demonstrate a failing build check, run with
// FAIL_ON_ERROR=1 and --invalid.
run(async () => {
  const request = z.discriminatedUnion('action', [
    z.object({ action: z.literal('lookup'), id: z.string() }),
    z.object({ action: z.literal('search'), query: z.string() }),
  ]);

  const tools = {
    lookup: process.argv.includes('--invalid')
      ? tool({ inputSchema: request })
      : tool({ inputSchema: z.object({ request }) }),
  };

  await validateToolSchemas({ tools });
  console.log('Tool schemas passed Anthropic root compatibility checks.');
});
