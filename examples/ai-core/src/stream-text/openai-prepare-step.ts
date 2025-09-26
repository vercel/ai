import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const retrieveInformation = tool({
  description: 'Retrieve information from the database',
  inputSchema: z
    .object({
      query: z.string(),
    })
    .describe('The query to retrieve information from the database'),
  execute: async ({ query }) => {
    return {
      content: [`Retrieved information for query: ${query}`],
    };
  },
});

async function main() {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    tools: { retrieveInformation },
    prepareStep({ stepNumber }) {
      if (stepNumber === 0) {
        return {
          toolChoice: { type: 'tool', toolName: 'retrieveInformation' },
          activeTools: ['retrieveInformation'],
        };
      }
    },
    activeTools: [],
    stopWhen: stepCountIs(5),
  });

  await result.consumeStream();

  console.log(JSON.stringify(await result.steps, null, 2));
}

main().catch(console.error);
