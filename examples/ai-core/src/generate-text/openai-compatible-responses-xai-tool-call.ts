import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { z } from 'zod';

async function main() {
  const xai = createOpenAICompatible({
    baseURL: 'https://api.x.ai/v1',
    name: 'xai',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
  });

  const result = await generateText({
    model: xai.responsesModel('grok-2-1212'),
    system: 'You are a helpful assistant.',
    prompt: 'What is the weather like in San Francisco and New York?',
    maxOutputTokens: 200,
    tools: {
      getWeather: {
        description: 'Get the weather for a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get weather for'),
          unit: z
            .enum(['celsius', 'fahrenheit'])
            .optional()
            .describe('Temperature unit'),
        }),
        execute: async ({ location, unit = 'celsius' }) => {
          // Simulate API call
          return {
            location,
            temperature: unit === 'celsius' ? 22 : 72,
            unit,
            condition: 'Sunny',
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
