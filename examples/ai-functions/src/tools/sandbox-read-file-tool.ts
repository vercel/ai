import { tool } from 'ai';
import { z } from 'zod';

export function sandboxReadFileTool() {
  return tool({
    description: 'Read a file',
    inputSchema: z.object({
      path: z.string(),
    }),

    execute: async ({ path }, { sandbox }) => {
      if (!sandbox) {
        throw new Error('Sandbox is not available');
      }
      return (await sandbox.readFile({ path })).content;
    },
  });
}
