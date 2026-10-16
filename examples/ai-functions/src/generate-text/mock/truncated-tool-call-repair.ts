import { generateText, InvalidToolInputError, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        warnings: [],
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 20,
            text: 20,
            reasoning: undefined,
          },
        },
        finishReason: { raw: 'length', unified: 'length' },
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'cityAttractions',
            input: '{"city":"San Francisco',
          },
        ],
      }),
    }),
    tools: {
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    prompt: 'What are the tourist attractions in San Francisco?',
    repairToolCall: async ({ toolCall, error }) => {
      if (!InvalidToolInputError.isInstance(error) || !error.truncated) {
        return null;
      }

      return {
        ...toolCall,
        input: `${toolCall.input}"}`,
      };
    },
  });

  console.log(JSON.stringify(result.toolCalls, null, 2));
});
