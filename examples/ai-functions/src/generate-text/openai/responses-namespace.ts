import { openai } from '@ai-sdk/openai';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5.4'),
    prompt: 'What is the weather in San Francisco?',
    stopWhen: stepCountIs(10),
    onStepFinish: step => {
      console.log(`\n=== Step Content ===`);
      console.dir(step.content, { depth: Infinity });
      console.log(`\n=== Step Response ===`);
      console.dir(step.response.body, { depth: Infinity });
    },
    tools: {
      toolSearch: openai.tools.toolSearch(),

      // Group weather tools into a namespace with deferred loading
      weatherNamespace: openai.tools.namespace({
        name: 'weather_tools',
        description: 'Tools for getting weather information and forecasts',
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather at a specific location',
            defer_loading: true,
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state, e.g. San Francisco, CA',
                },
                unit: {
                  type: 'string',
                  enum: ['celsius', 'fahrenheit'],
                  description: 'Temperature unit',
                },
              },
              required: ['location'],
            },
          },
          {
            type: 'function',
            name: 'get_forecast',
            description: 'Get the 5-day weather forecast for a location',
            defer_loading: true,
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state',
                },
              },
              required: ['location'],
            },
          },
        ],
      }),

      // Non-namespaced tool with deferred loading
      send_email: tool({
        description: 'Send an email to a recipient',
        inputSchema: z.object({
          to: z.string().describe('Recipient email address'),
          subject: z.string().describe('Email subject'),
          body: z.string().describe('Email body content'),
        }),
        execute: async ({ to, subject }) => ({
          success: true,
          message: `Email sent to ${to} with subject: ${subject}`,
        }),
        providerOptions: {
          openai: { deferLoading: true },
        },
      }),

      // Handlers for namespace tools (executed when the model calls them)
      get_weather: tool({
        description: 'Get the current weather at a specific location',
        inputSchema: z.object({
          location: z.string(),
          unit: z.enum(['celsius', 'fahrenheit']).optional(),
        }),
        execute: async ({ location, unit = 'fahrenheit' }) => ({
          location,
          temperature: unit === 'celsius' ? 18 : 64,
          condition: 'Partly cloudy',
          humidity: 65,
        }),
      }),

      get_forecast: tool({
        description: 'Get the 5-day weather forecast for a location',
        inputSchema: z.object({
          location: z.string(),
        }),
        execute: async ({ location }) => ({
          location,
          forecast: [
            { day: 'Monday', high: 68, low: 55 },
            { day: 'Tuesday', high: 72, low: 58 },
            { day: 'Wednesday', high: 65, low: 52 },
          ],
        }),
      }),
    },
  });

  console.log('\n=== Final Result ===');
  console.log('Text:', result.text);
});
