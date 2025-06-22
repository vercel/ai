import { openai } from '@ai-sdk/openai';
import { stepCountIs, ModelMessage, streamText, tool } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

async function main() {
  while (true) {
    messages.push({ role: 'user', content: await terminal.question('You: ') });

    const result = streamText({
      model: openai('gpt-4o'),
      tools: {
        weather: tool({
          description: 'Get the weather in a location',
          inputSchema: z.object({
            location: z
              .string()
              .describe('The location to get the weather for'),
          }),
          execute: ({ location }) => ({
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          }),
          toModelOutput: ({ location, temperature }) => ({
            type: 'text',
            value: `The weather in ${location} is ${temperature} degrees Fahrenheit.`,
          }),
        }),
      },
      stopWhen: stepCountIs(5),
      messages,
    });

    process.stdout.write('\nAssistant: ');
    for await (const delta of result.textStream) {
      process.stdout.write(delta);
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);

    console.log(
      (await result.steps)
        .map(step => JSON.stringify(step.request.body))
        .join('\n'),
    );
  }
}

main().catch(console.error);
