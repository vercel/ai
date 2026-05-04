import { tool } from 'ai';
import { z } from 'zod';
import type { Sandbox } from './sandbox';

export function sandboxShellTool() {
  return tool({
    description: 'Run a shell command',
    inputSchema: z.object({
      command: z.string(),
    }),
    contextSchema: z.object({
      sandbox: z.custom<Sandbox>(),
    }),
    execute: async ({ command }, { context: { sandbox } }) => {
      return sandbox.executeCommand({ command });
    },
  });
}
