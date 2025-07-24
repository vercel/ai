import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { stepCountIs, ModelMessage, streamText, tool, APICallError } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod/v4';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

// what is the weather in the 5th largest coastal city of germany?
async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = streamText({
      model: openai.responses('o3'),
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
      messages,
      // includeRawChunks: true,
      onError: ({ error }) => {
        console.log('onError');
        console.error(error);

        if (APICallError.isInstance(error)) {
          console.error(JSON.stringify(error.requestBodyValues, null, 2));
        }
      },
      // providerOptions: {
      //   openai: {
      //     store: false, // No data retention - makes interaction stateless
      //     reasoningEffort: 'medium',
      //     reasoningSummary: 'auto',
      //     include: ['reasoning.encrypted_content'], // Hence, we need to retrieve the model's encrypted reasoning to be able to pass it to follow-up requests
      //   } satisfies OpenAIResponsesProviderOptions,
      // },
    });

    process.stdout.write('\nAssistant: ');
    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case 'raw':
          console.log(JSON.stringify(chunk.rawValue, null, 2));
          break;

        case 'reasoning-start':
          process.stdout.write('\x1b[34m');
          break;

        case 'reasoning-delta':
          process.stdout.write(chunk.text);
          break;

        case 'reasoning-end':
          process.stdout.write('\x1b[0m');
          process.stdout.write('\n');
          break;

        case 'tool-input-start':
          process.stdout.write('\x1b[33m');
          console.log('Tool call:', chunk.toolName);
          process.stdout.write('Tool args: ');
          break;

        case 'tool-input-delta':
          process.stdout.write(chunk.delta);
          break;

        case 'tool-input-end':
          console.log();
          break;

        case 'tool-result':
          console.log('Tool result:', chunk.output);
          process.stdout.write('\x1b[0m');
          break;

        case 'tool-error':
          process.stdout.write('\x1b[0m');
          process.stderr.write('\x1b[31m');
          console.error('Tool error:', chunk.error);
          process.stderr.write('\x1b[0m');
          break;

        case 'text-start':
          process.stdout.write('\x1b[32m');
          break;

        case 'text-delta':
          process.stdout.write(chunk.text);
          break;

        case 'text-end':
          process.stdout.write('\x1b[0m');
          console.log();
          break;
      }
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
}

main().catch(error => {
  console.log('main error');
  console.error(error);

  if (APICallError.isInstance(error)) {
    console.error(JSON.stringify(error.requestBodyValues, null, 2));
  }
});
