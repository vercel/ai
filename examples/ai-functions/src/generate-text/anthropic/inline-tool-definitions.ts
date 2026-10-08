import { anthropic } from '@ai-sdk/anthropic';
import {
  generateText,
  jsonSchema,
  tool,
  wrapLanguageModel,
  type ModelMessage,
} from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const model = anthropic('claude-opus-5-5');
  const weather = tool({
    description: 'Get current weather',
    inputSchema: jsonSchema<{ city: string }>({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    }),
    execute: async ({ city }) => ({ city, temperature: 20 }),
  });
  const messages: ModelMessage[] = [
    { role: 'user', content: 'Which weather tools are available?' },
  ];
  const first = await generateText({
    model,
    tools: { get_weather: weather },
    messages,
  });
  messages.push(...first.response.messages);

  const forecastSchema = {
    type: 'object' as const,
    properties: { city: { type: 'string' as const } },
    required: ['city'],
    additionalProperties: false,
  };
  const forecast = tool({
    description: 'Get a five-day forecast',
    inputSchema: jsonSchema<{ city: string }>(forecastSchema),
    execute: async ({ city }) => ({ city, forecast: 'Sunny for five days' }),
  });
  messages.push({
    role: 'user',
    content: 'What is the five-day forecast for Paris?',
  });
  messages.push({
    role: 'system',
    content: '',
    providerOptions: {
      anthropic: {
        toolChanges: [
          {
            type: 'tool_addition',
            tool: {
              type: 'function',
              name: 'get_forecast',
              description: 'Get a five-day forecast',
              inputSchema: forecastSchema,
            },
          },
        ],
      },
    },
  });

  const positionedModel = wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => ({
        ...params,
        tools: params.tools?.filter(tool => tool.name !== 'get_forecast'),
      }),
    },
  });

  const result = await generateText({
    model: positionedModel,
    messages,
    allowSystemInMessages: true,
    tools: { get_weather: weather, get_forecast: forecast },
  });
  console.log(result.text);
  console.log(result.toolResults);
});
