import { moonshot } from '@ai-sdk/moonshot';
import { generateText, tool, ModelMessage } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod/v4';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const messages: ModelMessage[] = [];

  while (true) {
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const { text } = await generateText({
      model: moonshot('kimi-k2-0711-preview'),
      tools: {
        weather: tool({
          description: 'Get the weather in a location',
          inputSchema: z.object({
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
      messages,
    });

    console.log(`Assistant: ${text}`);
    messages.push({ role: 'assistant', content: text });
  }
}

main().catch(console.error);
