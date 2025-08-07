import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';
import { weatherTool } from '../tools/weather-tool';
import { bedrock } from '@ai-sdk/amazon-bedrock';

async function main() {
  const result = await generateText({
    model: bedrock('us.amazon.nova-pro-v1:0'),
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    temperature: 0,
    topK: 1,
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  for (const toolCall of result.toolCalls) {
    if (toolCall.dynamic) {
      continue;
    }

    switch (toolCall.toolName) {
      case 'cityAttractions': {
        toolCall.input.city;
        break;
      }

      case 'weather': {
        toolCall.input.location;
        break;
      }
    }
  }

  for (const toolResult of result.toolResults) {
    if (toolResult.dynamic) {
      continue;
    }

    switch (toolResult.toolName) {
      case 'weather': {
        toolResult.input.location;
        toolResult.output.location;
        toolResult.output.temperature;
        break;
      }
    }
  }

  console.log(result.text);
  console.log(JSON.stringify(result.toolCalls, null, 2));
  console.log(JSON.stringify(result.toolResults, null, 2));
}

main().catch(console.error);
