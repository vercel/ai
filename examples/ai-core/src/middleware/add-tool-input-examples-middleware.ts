import { openai } from '@ai-sdk/openai';
import {
  addToolInputExamplesMiddleware,
  generateText,
  tool,
  wrapLanguageModel,
} from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: wrapLanguageModel({
      model: openai('gpt-4o'),
      middleware: addToolInputExamplesMiddleware({
        examplesPrefix: 'Input Examples:',
        formatExample: (example, index) =>
          `${index + 1}. ${JSON.stringify(example.input)}`,
        removeInputExamples: true,
      }),
    }),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        inputExamples: [
          { input: { location: 'San Francisco' } },
          { input: { location: 'London' } },
        ],
      }),
    },
    toolChoice: 'required',
    prompt: 'What is the weather in Tokyo?',
  });

  console.log(JSON.stringify(result.request.body, null, 2));
}

main().catch(console.error);
