import { tool } from 'ai';
import { z } from 'zod';

export function sandboxShellTool() {
  return tool({
    description: 'Run a shell command',
    inputSchema: z.object({
      command: z.string(),
      workingDirectory: z.string().optional(),
    }),

    execute: async (
      { command, workingDirectory },
      { abortSignal, experimental_sandbox },
    ) => {
      // TODO figure out type inference to turn the runtime error into a type error
      if (!experimental_sandbox) {
        throw new Error('Experimental sandbox is not available');
      }
      return experimental_sandbox.executeCommand({
        command,
        workingDirectory,
        abortSignal,
      });
    },
  });
}
