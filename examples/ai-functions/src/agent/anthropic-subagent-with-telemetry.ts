import { AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { generateText, tool, otel, createTrace, stepCountIs } from 'ai';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { run } from '../lib/run';
import { z } from 'zod';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

run(async () => {
  const trace = createTrace({
    ...otel(),
    name: 'anthropic-subagents-demo',
    functionId: 'anthropic-subagents-demo',
    metadata: {
      environment: 'demo',
      cost_tracking: 'enabled',
    },
  });

  const weatherResearchTool = tool({
    description:
      'Research the current weather conditions for a city. Delegates to a specialized weather agent.',
    inputSchema: z.object({
      city: z.string().describe('The city to research weather for'),
    }),
    execute: async ({ city }, { abortSignal }) => {
      // subagent - explicitly passes the trace so it shares the same trace
      const result = await generateText({
        model: anthropic('claude-3-7-sonnet-20250219'),
        system:
          'You are a weather research agent. Use the getWeather tool to look up conditions. ' +
          'IMPORTANT: Summarize your findings clearly in your final response, including temperature and conditions.',
        prompt: `What is the current weather in ${city}?`,
        tools: {
          getWeather: tool({
            description: 'Get the weather for a given city',
            inputSchema: z.object({
              city: z.string(),
            }),
            execute: async ({ city }) => {
              const weatherData: Record<
                string,
                { temperature: number; condition: string }
              > = {
                'San Francisco': { temperature: 58, condition: 'foggy' },
                'New York': { temperature: 35, condition: 'snowy' },
                Tokyo: { temperature: 45, condition: 'cloudy' },
              };
              return (
                weatherData[city] ?? { temperature: 70, condition: 'sunny' }
              );
            },
          }),
        },
        providerOptions: {
          anthropic: {
            thinking: { type: 'enabled', budgetTokens: 5000 },
          } satisfies AnthropicProviderOptions,
        },
        stopWhen: stepCountIs(10),
        abortSignal,
        telemetry: { ...trace, functionId: 'weather-subagent' },
      });
      return result.text;
    },
  });

  const cityInfoTool = tool({
    description:
      'Get interesting information and travel tips about a city. Delegates to a specialized city info agent.',
    inputSchema: z.object({
      city: z.string().describe('The city to get information about'),
    }),
    execute: async ({ city }, { abortSignal }) => {
      // subagent - explicitly passes the trace so it shares the same trace
      const result = await generateText({
        model: anthropic('claude-3-7-sonnet-20250219'),
        system:
          'You are a city information agent. Use the getCityInfo tool, then summarize ' +
          'interesting facts and travel tips in your final response.',
        prompt: `Tell me about ${city} — interesting facts and travel tips.`,
        tools: {
          getCityInfo: tool({
            description: 'Get information about a city',
            inputSchema: z.object({
              city: z.string(),
            }),
            execute: async ({ city }) => {
              const cityInfo: Record<
                string,
                {
                  population: string;
                  knownFor: string;
                  bestTimeToVisit: string;
                }
              > = {
                'San Francisco': {
                  population: '808,000',
                  knownFor: 'Golden Gate Bridge, tech industry, cable cars',
                  bestTimeToVisit: 'September-November',
                },
                'New York': {
                  population: '8.3 million',
                  knownFor: 'Statue of Liberty, Broadway, Central Park',
                  bestTimeToVisit: 'April-June',
                },
                Tokyo: {
                  population: '13.9 million',
                  knownFor: 'Temples, cuisine, cherry blossoms',
                  bestTimeToVisit: 'March-May',
                },
              };
              return (
                cityInfo[city] ?? {
                  population: 'Unknown',
                  knownFor: 'Explore and discover!',
                  bestTimeToVisit: 'Anytime',
                }
              );
            },
          }),
        },
        stopWhen: stepCountIs(10),
        abortSignal,
        telemetry: { ...trace, functionId: 'city-info-subagent' },
      });
      return result.text;
    },
  });

  // main agent
  const result = await generateText({
    model: anthropic('claude-3-7-sonnet-20250219'),
    prompt:
      "I'm planning a trip to San Francisco. What's the weather like and what should I know about the city?",
    tools: {
      weatherResearch: weatherResearchTool,
      cityInfo: cityInfoTool,
    },
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      } satisfies AnthropicProviderOptions,
    },
    stopWhen: stepCountIs(100),
    telemetry: trace,
  });

  trace.end();

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();
  console.log('Text:');
  console.log(result.text);

  await sdk.shutdown();
});
