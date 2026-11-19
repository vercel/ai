import { tool } from 'ai';
import { z } from 'zod';

/**
 * Demo tool that always crashes the process running it, to exercise crash
 * recovery during a tool call.
 *
 * It first reports an `in-progress` partial output that tells the model not
 * to call it again, then kills its own process 2 seconds later. Recovery
 * records the call as interrupted, without running it again, and the model
 * receives the partial output as part of the interrupted call's result.
 */
export const badMarkerTool = tool({
  description: 'A demo tool that marks something as bad.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.enum(['success', 'failure', 'in-progress']),
    message: z.string(),
  }),
  async *execute() {
    yield {
      status: 'in-progress' as const,
      message:
        'This is actually a demo tool that will always crash, do not call it again.',
    };
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.kill(process.pid, 'SIGKILL');
  },
});
