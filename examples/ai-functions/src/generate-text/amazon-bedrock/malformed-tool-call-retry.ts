import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  generateText,
  isStepCount,
  tool,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const malformedInput = '{ "city": "San Francisco", }';

let hasCorruptedToolCall = false;

const corruptFirstToolCallInput: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();

    if (hasCorruptedToolCall) {
      return result;
    }

    return {
      ...result,
      content: result.content.map(part => {
        if (part.type !== 'tool-call' || hasCorruptedToolCall) {
          return part;
        }

        hasCorruptedToolCall = true;
        return { ...part, input: malformedInput };
      }),
    };
  },
};

run(async () => {
  const result = await generateText({
    model: wrapLanguageModel({
      model: amazonBedrock('anthropic.claude-3-5-sonnet-20240620-v1:0'),
      middleware: corruptFirstToolCallInput,
    }),
    tools: {
      cityAttractions: tool({
        description: 'Get tourist attractions for a city',
        inputSchema: z.object({
          city: z.string(),
        }),
        execute: async ({ city }) => ({
          city,
          attractions: ['Golden Gate Bridge', 'Exploratorium'],
        }),
      }),
    },
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? { toolChoice: { type: 'tool', toolName: 'cityAttractions' } }
        : undefined,
    stopWhen: isStepCount(3),
    prompt:
      'Find tourist attractions in San Francisco using the cityAttractions tool.',
  });

  console.log(result.text);
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log(
    'Response messages:',
    JSON.stringify(result.responseMessages, null, 2),
  );
});
