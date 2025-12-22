import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: openai('gpt-4o'),
    tools: {
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          if (city === 'San Francisco') {
            return ['Golden Gate Bridge', 'Alcatraz Island'];
          }
          return [];
        },
      }),
    },
    prepareStep: async ({ stepNumber }) => {
      // inject invalid tool call in first step:
      if (stepNumber === 0) {
        return {
          model: new MockLanguageModelV3({
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
              finishReason: { raw: undefined, unified: 'tool-calls' },
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
        };
      }
    },
    prompt: 'What are the tourist attractions in San Francisco?',
    stopWhen: stepCountIs(5),
  });

  console.log('Content:');
  console.log(JSON.stringify(result.content, null, 2));

  console.log('Response messages:');
  console.log(JSON.stringify(result.response.messages, null, 2));
}

main().catch(console.error);
