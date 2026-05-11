import { BrowserUse } from 'browser-use-sdk';
import { tool, type UIToolInvocation } from 'ai';
import { z } from 'zod';

export const runBrowserTaskTool = tool({
  description:
    'Run a real browser task in the cloud. Use for anything the model cannot answer from memory: live web pages, post-cutoff news, prices, search results, multi-step site flows, anything behind JS.',
  inputSchema: z.object({
    task: z
      .string()
      .describe(
        'A natural-language instruction for the browser agent, e.g. "find the top 3 trending repos on github today and return name + stars".',
      ),
  }),
  async *execute({ task }: { task: string }) {
    const client = new BrowserUse();

    const run = client.run(task);

    for await (const step of run) {
      yield {
        state: 'running' as const,
        step: step.number,
        nextGoal: step.nextGoal,
        url: step.url,
      };
    }

    const result = run.result!;
    yield {
      state: 'done' as const,
      sessionId: result.id,
      status: result.status,
      stepCount: result.steps.length,
      output: result.output,
    };
  },
});

export type RunBrowserTaskUIToolInvocation = UIToolInvocation<
  typeof runBrowserTaskTool
>;
