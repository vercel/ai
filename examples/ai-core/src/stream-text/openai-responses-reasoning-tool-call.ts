import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: openai.responses('o3-mini'),
    stopWhen: stepCountIs(10),
    tools: {
      generateRandomText: tool({
        description: 'Generate a random text of a given length',
        inputSchema: z.object({ length: z.number().min(1) }),
        execute: async ({ length }) => {
          if (Math.random() < 0.5) {
            throw new Error('Segmentation fault');
          }
          return Array.from({ length }, () =>
            String.fromCharCode(Math.floor(Math.random() * 26) + 97),
          ).join('');
        },
      }),
      countChar: tool({
        description:
          'Count the number of occurrences of a specific character in the text',
        inputSchema: z.object({ text: z.string(), char: z.string() }),
        execute: async ({ text, char }) => {
          if (Math.random() < 0.5) {
            throw new Error('Buffer overflow');
          }
          return text.split(char).length - 1;
        },
      }),
    },
    system: `If you encounter a function call error, you should retry 3 times before giving up.`,
    prompt: `Generate two texts of 1024 characters each. Count the number of "a" in the first text, and the number of "b" in the second text.`,
    providerOptions: {
      openai: {
        store: false,
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        include: ['reasoning.encrypted_content'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'start':
        console.log('START');
        break;

      case 'start-step':
        console.log('STEP START');
        console.log(
          'Request body:',
          JSON.stringify(chunk.request.body, null, 2),
        );
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

      case 'finish-step':
        console.log('Finish reason:', chunk.finishReason);
        console.log('Usage:', chunk.usage);
        console.log('STEP FINISH');
        break;

      case 'finish':
        console.log('Finish reason:', chunk.finishReason);
        console.log('Total usage:', chunk.totalUsage);
        console.log('FINISH');
        break;

      case 'error':
        process.stdout.write('\x1b[0m');
        process.stderr.write('\x1b[31m');
        console.error('Error:', chunk.error);
        process.stderr.write('\x1b[0m');
        break;
    }
  }

  console.log('MESSAGES START');
  const messages = (await result.steps).map(step => step.response.messages);
  for (const [i, message] of messages.entries()) {
    console.log(`Step ${i}:`, JSON.stringify(message, null, 2));
  }
  console.log('MESSAGES FINISH');
}

main().catch(console.error);
