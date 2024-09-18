import { openai } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    maxTokens: 512,
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        parameters: jsonSchema<{ location: string }>({
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
      cityAttractions: tool({
        parameters: jsonSchema<{ city: string }>({
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        }),
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

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
