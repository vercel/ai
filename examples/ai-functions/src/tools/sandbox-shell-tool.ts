import { tool } from 'ai';
import { z } from 'zod';

export function sandboxShellTool() {
  return tool({
    description: 'Run a shell command',
    inputSchema: z.object({ command: z.string() }),
    requiresSandbox: true,
    execute: async ({ command }, { sandbox }) =>
      sandbox.executeCommand({ command }),
  });
}
