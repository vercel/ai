import { alibaba } from '@ai-sdk/alibaba';
import { generateText, ModelMessage, stepCountIs, tool } from 'ai';
import * as readline from 'node:readline/promises';
import { z } from 'zod';
import { run } from '../lib/run';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

run(async () => {
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = await generateText({
      model: alibaba('qwen-plus'),
      system: 'You are a helpful, respectful and honest assistant.',
      messages,
      stopWhen: stepCountIs(5),
      tools: {
        getWeather: tool({
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
    });

    console.log('\nAssistant:', result.text);
    console.log();

    messages.push(...result.response.messages);
  }
});
