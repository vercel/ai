import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const togetherai = createOpenAICompatible({
    baseURL: 'https://api.together.xyz/v1',
    name: 'togetherai',
    headers: {
      Authorization: `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
    },
  });
  const model = togetherai.chatModel(
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  );
  const result = await generateText({
    model,
    maxTokens: 512,
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        parameters: z.object({ city: z.string() }),
      }),
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  // typed tool calls:
  for (const toolCall of result.toolCalls) {
    switch (toolCall.toolName) {
      case 'cityAttractions': {
        toolCall.args.city; // string
        break;
      }

      case 'weather': {
        toolCall.args.location; // string
        break;
      }
    }
  }

  // typed tool results for tools with execute method:
  for (const toolResult of result.toolResults) {
    switch (toolResult.toolName) {
      // NOT AVAILABLE (NO EXECUTE METHOD)
      // case 'cityAttractions': {
      //   toolResult.args.city; // string
      //   toolResult.result;
      //   break;
      // }

      case 'weather': {
        toolResult.args.location; // string
        toolResult.result.location; // string
        toolResult.result.temperature; // number
        break;
      }
    }
  }

  console.log('Text:', result.text);
  console.log('Tool Calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool Results:', JSON.stringify(result.toolResults, null, 2));
}

main().catch(console.error);
