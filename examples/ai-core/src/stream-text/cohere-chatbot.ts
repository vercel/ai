import { cohere } from '@ai-sdk/cohere';
import { CoreMessage, streamText, tool } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];

async function main() {
  while (true) {
    messages.push({ role: 'user', content: await terminal.question('You: ') });

    const result = streamText({
      model: cohere('command-r-plus'),
      tools: {
        weather: tool({
          description: 'Get the weather in a location',
          parameters: z.object({
            location: z
              .string()
              .describe('The location to get the weather for'),
          }),
          execute: async ({ location }) => ({
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          }),
        }),
      },
      maxSteps: 5,
      messages,
    });

    process.stdout.write('\nAssistant: ');
    for await (const delta of result.textStream) {
      process.stdout.write(delta);
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
}

main().catch(console.error);
