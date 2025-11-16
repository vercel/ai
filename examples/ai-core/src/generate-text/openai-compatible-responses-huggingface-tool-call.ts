import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { z } from 'zod';

async function main() {
  const huggingface = createOpenAICompatible({
    baseURL: 'https://router.huggingface.co/v1',
    name: 'huggingface',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
    },
  });

  const result = await generateText({
    model: huggingface.responsesModel('moonshotai/Kimi-K2-Instruct'),
    system: 'You are a helpful assistant.',
    prompt: 'What is the current time in Tokyo?',
    maxOutputTokens: 200,
    tools: {
      getCurrentTime: {
        description: 'Get the current time for a timezone',
        inputSchema: z.object({
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

  console.log('Tool Calls:', result.toolCalls);
  console.log('Tool Results:', result.toolResults);
  console.log();
  console.log('Text:', result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
}

main().catch(console.error);
