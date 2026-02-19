import { vertex } from '@ai-sdk/google-vertex';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { text } = await generateText({
<<<<<<< HEAD:examples/ai-core/src/generate-text/google-vertex-tool-call.ts
    model: vertex('gemini-1.5-pro'),
=======
    model: vertex('gemini-3.1-pro-preview'),
>>>>>>> 765b01381 (feat(provider/google): add support for `gemini-3.1-pro-preview` (#12695)):examples/ai-functions/src/generate-text/google-vertex-tool-call.ts
    prompt: 'What is the weather in New York City? ',
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          console.log('Getting weather for', location);
          return {
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  console.log(text);
}

main().catch(console.error);
