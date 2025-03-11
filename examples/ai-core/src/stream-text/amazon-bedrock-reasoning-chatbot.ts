import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { CoreMessage, streamText, tool } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod';

const bedrock = createAmazonBedrock({
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

const messages: CoreMessage[] = [];

async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = streamText({
      model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
      messages,
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
      maxRetries: 0,
      providerOptions: {
        bedrock: {
          reasoning_config: { type: 'enabled', budgetTokens: 2048 },
        },
      },
      onError: error => {
        console.error(error);
      },
    });

    process.stdout.write('\nAssistant: ');
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning') {
        process.stdout.write('\x1b[34m' + part.textDelta + '\x1b[0m');
      } else if (part.type === 'redacted-reasoning') {
        process.stdout.write('\x1b[31m' + '<redacted>' + '\x1b[0m');
      } else if (part.type === 'text-delta') {
        process.stdout.write(part.textDelta);
      }
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
}

main().catch(console.error);
