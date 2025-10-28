import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { z } from 'zod';

async function main() {
  const huggingface = createOpenAICompatible({
    baseURL: 'https://router.huggingface.co/v1',
    name: 'huggingface',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
    },
  });

  const result = streamText({
    model: huggingface.responsesModel('moonshotai/Kimi-K2-Instruct'),
    system: 'You are a helpful assistant.',
    prompt: 'What is the current time in Tokyo?',
    maxOutputTokens: 200,
    tools: {
      getCurrentTime: {
        description: 'Get the current time for a timezone',
        parameters: z.object({
          timezone: z
            .string()
            .describe('The timezone identifier (e.g., Asia/Tokyo)'),
        }),
        execute: async ({ timezone }) => {
          // Simulate API call
          return {
            timezone,
            time: new Date().toLocaleString('en-US', { timeZone: timezone }),
          };
        },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.delta);
    } else if (part.type === 'tool-call') {
      console.log('\nTool call:', part.toolName);
      console.log('Arguments:', part.input);
    } else if (part.type === 'tool-result') {
      console.log('Tool result:', part.result);
    }
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
