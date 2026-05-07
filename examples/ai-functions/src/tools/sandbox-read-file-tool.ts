import { tool } from 'ai';
import { z } from 'zod';

export function sandboxReadFileTool() {
  return tool({
    description: 'Read a file',
    inputSchema: z.object({
      path: z.string(),
    }),

    execute: async ({ path }, { sandbox }) => {
      // TODO figure out type inference to turn the runtime error into a type error
      if (!sandbox) {
        throw new Error('Sandbox is not available');
      }
      return sandbox.readFile({ path });
    },
  });
}
