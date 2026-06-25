import { tool } from 'ai';
import { z } from 'zod';

/** A trivial host-executed user tool used by the tool scenarios. */
export function addTool() {
  return tool({
    description: 'Add two numbers and return their sum.',
    inputSchema: z.object({
      a: z.number().describe('First addend'),
      b: z.number().describe('Second addend'),
    }),
    execute: async ({ a, b }) => ({ result: a + b }),
  });
}
