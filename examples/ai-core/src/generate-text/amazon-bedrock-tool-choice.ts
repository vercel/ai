import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';
import { bedrock } from '@ai-sdk/amazon-bedrock';

async function main() {
  const result = await generateText({
    model: bedrock(
      `arn:aws:bedrock:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0`,
    ),
    maxTokens: 512,
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        parameters: z.object({ city: z.string() }),
      }),
    },
    toolChoice: {
      type: 'tool',
      toolName: 'weather',
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
