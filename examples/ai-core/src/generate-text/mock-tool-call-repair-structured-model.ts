import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, NoSuchToolError, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateText({
    model: new MockLanguageModelV2({
      doGenerate: async () => ({
        warnings: [],
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
        finishReason: 'tool-calls',
        content: [
          {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: 'call-1',
            toolName: 'cityAttractions',
            // wrong tool call arguments (city vs cities):
            input: `{ "city": "San Francisco" }`,
          },
        ],
      }),
    }),
    tools: {
      cityAttractions: tool({
        inputSchema: z.object({ cities: z.array(z.string()) }),
      }),
    },
    prompt: 'What are the tourist attractions in San Francisco?',

    experimental_repairToolCall: async ({
      toolCall,
      tools,
      inputSchema,
      error,
    }) => {
      if (NoSuchToolError.isInstance(error)) {
        return null; // do not attempt to fix invalid tool names
      }

      const tool = tools[toolCall.toolName as keyof typeof tools];

      // example approach: use a model with structured outputs for repair:
      const { object: repairedArgs } = await generateObject({
        model: openai('gpt-4o'),
        schema: tool.inputSchema,
        prompt: [
          `The model tried to call the tool "${
            toolCall.toolName
          }" with the following arguments: ${JSON.stringify(toolCall.input)}.`,
          `The tool accepts the following schema: ${JSON.stringify(
            inputSchema(toolCall),
          )}.`,
          'Please try to fix the arguments.',
        ].join('\n'),
      });

      return { ...toolCall, args: JSON.stringify(repairedArgs) };
    },
  });

  console.log('Repaired tool calls:');
  console.log(JSON.stringify(result.toolCalls, null, 2));
}

main().catch(console.error);
