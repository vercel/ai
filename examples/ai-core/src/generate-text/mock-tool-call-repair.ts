import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, NoSuchToolError, tool } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: new MockLanguageModelV1({
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: 'tool-calls',
        toolCalls: [
          {
            toolCallType: 'function',
            toolCallId: 'call-1',
            toolName: 'cityAttractions',
            // wrong tool call arguments (city vs cities):
            args: `{ "city": "San Francisco" }`,
          },
        ],
      }),
    }),
    tools: {
      cityAttractions: tool({
        parameters: z.object({ cities: z.array(z.string()) }),
      }),
    },
    prompt: 'What are the tourist attractions in San Francisco?',

    experimental_repairToolCall: async ({
      toolCall,
      tools,
      parameterSchema,
      error,
      messages,
      system,
    }) => {
      if (NoSuchToolError.isInstance(error)) {
        return null; // do not attempt to fix invalid tool names
      }

      const tool = tools[toolCall.toolName as keyof typeof tools];

      // example approach: use a model with structured outputs for repair:
      const { object: repairedArgs } = await generateObject({
        model: openai('gpt-4o', { structuredOutputs: true }),
        schema: tool.parameters,
        prompt: [
          `The model tried to call the tool "${
            toolCall.toolName
          }" with the following arguments: ${JSON.stringify(toolCall.args)}.`,
          `The tool accepts the following schema: ${JSON.stringify(
            parameterSchema(toolCall),
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
