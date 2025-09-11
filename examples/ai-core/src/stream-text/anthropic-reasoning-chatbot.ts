import { AnthropicProviderOptions, createAnthropic } from '@ai-sdk/anthropic';
import { stepCountIs, ModelMessage, streamText, tool } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod';

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = streamText({
      model: anthropic('claude-3-7-sonnet-20250219'),
      messages,
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
      stopWhen: stepCountIs(5),
      maxRetries: 0,
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 12000 },
        } satisfies AnthropicProviderOptions,
      },
      onError: error => {
        console.error(error);
      },
    });

    process.stdout.write('\nAssistant: ');
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
      } else if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      }
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
}

main().catch(console.error);
