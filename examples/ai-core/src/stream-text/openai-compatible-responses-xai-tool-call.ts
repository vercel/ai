import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { z } from 'zod';

async function main() {
  const xai = createOpenAICompatible({
    baseURL: 'https://api.x.ai/v1',
    name: 'xai',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
  });

  const result = streamText({
    model: xai.responsesModel('grok-2-1212'),
    system: 'You are a helpful assistant.',
    prompt: 'What is the weather like in San Francisco?',
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

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'tool-call') {
      console.log('\nTool call:', part.toolName);
      console.log('Arguments:', part.input);
    } else if (part.type === 'tool-result') {
      console.log('Tool result:', part.output);
    }
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
