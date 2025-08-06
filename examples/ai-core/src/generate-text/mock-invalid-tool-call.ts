import { openai } from '@ai-sdk/openai';
import { generateText, ModelMessage, stepCountIs, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'What are the tourist attractions in San Francisco?',
    },
  ];

  const tools = {
    cityAttractions: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        if (city === 'San Francisco') {
          return ['Golden Gate Bridge', 'Alcatraz Island'];
        }
        return [];
      },
    }),
  };

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
            input: `{ "cities": "San Francisco" }`,
          },
        ],
      }),
    }),
    tools,
    messages,
  });

  console.log('Content:');
  console.log(JSON.stringify(result.content, null, 2));

  console.log('Response messages:');
  console.log(JSON.stringify(result.response.messages, null, 2));

  const result2 = await generateText({
    model: openai('gpt-4o'),
    tools,
    messages: [...messages, ...result.response.messages],
    stopWhen: stepCountIs(5),
  });

  console.log('Content:');
  console.log(JSON.stringify(result2.content, null, 2));

  console.log('Response messages:');
  console.log(JSON.stringify(result2.response.messages, null, 2));
}

main().catch(console.error);
