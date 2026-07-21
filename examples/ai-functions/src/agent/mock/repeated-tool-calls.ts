import { hasRepeatedToolCalls, tool, ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

let callNumber = 0;

const agent = new ToolLoopAgent({
  model: new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: 'tool-call',
          toolCallId: `call-${++callNumber}`,
          toolName: 'weather',
          input: JSON.stringify({ city: 'San Francisco' }),
        },
      ],
      finishReason: { raw: 'tool_calls', unified: 'tool-calls' },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 10,
          text: 0,
          reasoning: undefined,
        },
      },
      warnings: [],
    }),
  }),
  tools: {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, condition: 'sunny' }),
    }),
  },
  stopWhen: hasRepeatedToolCalls(3),
});

run(async () => {
  const result = await agent.generate({
    prompt: 'Check the weather.',
  });

  console.log(`Stopped after ${result.steps.length} repeated tool calls.`);
});
