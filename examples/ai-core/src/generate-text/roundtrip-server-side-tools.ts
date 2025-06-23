import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

/**
 * Comprehensive example demonstrating roundtrip generateText with server-side tools.
 *
 * This example shows:
 * 1. Server-side tools (provider-executed) like web search
 * 2. Client-side tools (executed by the client) like weather calculation
 * 3. Multi-step roundtrips where the model uses both types of tools
 * 4. How provider-executed tools are excluded from client execution but still processed
 */

async function runOpenAIExample() {
  console.log('OpenAI Roundtrip Example with Server-Side Tools');
  console.log('='.repeat(60));

  let stepCounter = 0;
  const result = await generateText({
    model: openai.responses('gpt-4o'),
    tools: {
      web_search_preview: openai.tools.webSearchPreview({}),

      getLocalWeather: tool({
        description: 'Get current weather for a specific location',
        inputSchema: z.object({
          location: z.string().describe('The city name to get weather for'),
        }),
        execute: async ({ location }) => {
          console.log(`Client executing weather lookup for: ${location}`);

          await new Promise(resolve => setTimeout(resolve, 1000));

          const temperatures = [18, 22, 25, 28, 15, 20, 24];
          const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy'];

          return {
            location,
            temperature:
              temperatures[Math.floor(Math.random() * temperatures.length)],
            condition:
              conditions[Math.floor(Math.random() * conditions.length)],
            humidity: Math.floor(Math.random() * 40) + 30,
          };
        },
      }),

      findNearbyCity: tool({
        description: 'Find a nearby major city for a given location',
        inputSchema: z.object({
          searchTerm: z
            .string()
            .describe('Search term or place to find nearby city for'),
        }),
        execute: async ({ searchTerm }) => {
          console.log(`Client finding nearby city for: ${searchTerm}`);

          const cities = [
            'Paris',
            'London',
            'New York',
            'Tokyo',
            'Sydney',
            'Berlin',
          ];
          return {
            nearbyCity: cities[Math.floor(Math.random() * cities.length)],
            searchTerm,
          };
        },
      }),
    },
    stopWhen: stepCountIs(4),
    prompt:
      'I need help planning a trip. First search for recent travel news in Europe, then find nearby weather for any cities mentioned. Show me a summary with weather details.',

    onStepFinish: step => {
      stepCounter++;
      console.log(`\nStep ${stepCounter} completed:`);
      console.log(`   Finish reason: ${step.finishReason}`);
      console.log(`   Tool calls: ${step.toolCalls.length}`);
      console.log(`   Tool results: ${step.toolResults.length}`);

      step.toolCalls.forEach(call => {
        const wasProviderExecuted = call.providerExecuted
          ? ' (provider-executed)'
          : ' (client-executed)';
        console.log(`   ${call.toolName}${wasProviderExecuted}`);
      });
    },
  });

  console.log('\nFinal Results:');
  console.log('-'.repeat(40));
  console.log('Text:', result.text);
  console.log('\nUsage:', result.usage);
  console.log('Total Usage:', result.totalUsage);

  if (result.sources.length > 0) {
    console.log(`\nSources found: ${result.sources.length}`);
    result.sources.forEach((source, i) => {
      if (source.sourceType === 'url') {
        console.log(`   ${i + 1}. ${source.title} - ${source.url}`);
      }
    });
  }

  console.log(`\nSteps completed: ${result.steps.length}`);
  console.log(
    `Total tool calls: ${result.steps.reduce((sum, step) => sum + step.toolCalls.length, 0)}`,
  );
  console.log(
    `Total tool results: ${result.steps.reduce((sum, step) => sum + step.toolResults.length, 0)}`,
  );
}

async function runAnthropicExample() {
  console.log('\n\nAnthropic Roundtrip Example with Server-Side Tools');
  console.log('='.repeat(60));

  let stepCounter = 0;
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-latest'),
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 2,
      }),

      getRestaurantRecommendations: tool({
        description: 'Get restaurant recommendations for a city',
        inputSchema: z.object({
          city: z
            .string()
            .describe('The city to get restaurant recommendations for'),
          cuisine: z.string().optional().describe('Preferred cuisine type'),
        }),
        execute: async ({ city, cuisine }) => {
          console.log(
            `Client finding restaurants in ${city}${cuisine ? ` for ${cuisine} cuisine` : ''}`,
          );

          await new Promise(resolve => setTimeout(resolve, 800));

          const restaurants = [
            { name: 'Le Petit Bistro', rating: 4.5, priceRange: '$$' },
            { name: 'Golden Dragon', rating: 4.2, priceRange: '$$$' },
            { name: "Mama's Kitchen", rating: 4.7, priceRange: '$' },
            { name: 'The Gourmet Corner', rating: 4.4, priceRange: '$$$$' },
          ];

          return {
            city,
            cuisine: cuisine || 'various',
            recommendations: restaurants.slice(
              0,
              Math.floor(Math.random() * 3) + 2,
            ),
          };
        },
      }),
    },
    stopWhen: stepCountIs(3),
    prompt:
      'Search for current food trends in major cities, then give me restaurant recommendations for one of the cities mentioned.',

    onStepFinish: step => {
      stepCounter++;
      console.log(`\nStep ${stepCounter} completed:`);
      console.log(`   Finish reason: ${step.finishReason}`);
      console.log(`   Content parts: ${step.content.length}`);

      step.toolCalls.forEach(call => {
        const wasProviderExecuted = call.providerExecuted
          ? ' (provider-executed)'
          : ' (client-executed)';
        console.log(`   ${call.toolName}${wasProviderExecuted}`);
      });
    },
  });

  console.log('\nFinal Results:');
  console.log('-'.repeat(40));
  console.log('Text:', result.text);
  console.log('\nUsage:', result.usage);

  if (result.sources.length > 0) {
    console.log(`\nSources found: ${result.sources.length}`);
  }

  console.log(`\nSteps completed: ${result.steps.length}`);
}

async function main() {
  try {
    await runOpenAIExample();

    await runAnthropicExample();

    console.log('\nExamples completed! Notice how:');
    console.log(
      '   • Server-side tools (web search) are executed by the provider',
    );
    console.log('   • Client-side tools are executed locally by your code');
    console.log('   • Both types work together in multi-step roundtrips');
    console.log(
      '   • Provider-executed tools are excluded from client execution',
    );
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

main().catch(console.error);
