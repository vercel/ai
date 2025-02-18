import { anthropic } from '@ai-sdk/anthropic';
import { CoreMessage, generateText, tool } from 'ai';
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
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const { text, reasoning, response } = await generateText({
      model: anthropic('research-claude-flannel'),
      tools: {
        weatherTool: tool({
          description: 'Get the weather in a location',
          parameters: z.object({
            location: z
              .string()
              .describe('The location to get the weather for'),
          }),
          // location below is inferred to be a string:
          execute: async ({ location }) => {
            console.log(`\x1b[32mGetting weather for: \x1b[0m${location}`);
            return {
              location,
              temperature: 72 + Math.floor(Math.random() * 21) - 10,
            };
          },
        }),
      },
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
      maxSteps: 5,
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 12000 },
        },
      },
    });

    console.log('Assistant:');

    if (reasoning) {
      console.log(`\x1b[36m${reasoning}\x1b[0m`);
    }

    if (text) {
      console.log(text);
    }

    console.log('\n');

    messages.push(...response.messages);
  }
}

main().catch(console.error);
