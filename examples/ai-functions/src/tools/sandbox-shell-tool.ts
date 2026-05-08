import { tool } from 'ai';
import { z } from 'zod';

export function sandboxShellTool() {
  return tool({
    description: 'Run a shell command',
    inputSchema: z.object({
      command: z.string(),
    }),

    execute: async ({ command }, { sandbox }) => {
      if (!sandbox) {
        throw new Error('Sandbox is not available');
      }
      return sandbox.executeCommand({ command });
    },
  });
}
