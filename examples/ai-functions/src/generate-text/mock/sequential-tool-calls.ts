import { generateText, isStepCount, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

run(async () => {
  const events: string[] = [];
  const timedTool = (name: string, durationMs: number) =>
    tool({
      inputSchema: z.object({}),
      execute: async () => {
        events.push(`${name}:start`);
        await new Promise(resolve => setTimeout(resolve, durationMs));
        events.push(`${name}:end`);
        return name;
      },
    });

  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'wait-call',
              toolName: 'wait',
              input: '{}',
            },
            {
              type: 'tool-call',
              toolCallId: 'read-call',
              toolName: 'read',
              input: '{}',
            },
          ],
          finishReason: { raw: 'tool-calls', unified: 'tool-calls' },
          usage,
          warnings: [],
        },
        {
          content: [{ type: 'text', text: 'Both tools completed in order.' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage,
          warnings: [],
        },
      ],
    }),
    prompt: 'Wait, then read.',
    tools: {
      wait: timedTool('wait', 50),
      read: timedTool('read', 1),
    },
    toolCallConcurrency: 1,
    stopWhen: isStepCount(2),
  });

  console.log(events.join(' -> '));
  console.log(result.text);
});
