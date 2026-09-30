import { generateText, isStepCount, tool, toolSearch } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'search',
              toolName: 'search',
              input: JSON.stringify({ query: 'trip planning' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'forecast',
              toolName: 'getForecast',
              input: JSON.stringify({ city: 'Bangalore' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              type: 'text',
              text: 'Bring an umbrella for your Bangalore trip.',
            },
          ],
          finishReason: { unified: 'stop', raw: undefined },
          usage,
          warnings: [],
        },
      ],
    }),
    tools: {
      search: toolSearch({
        search: async (query, tools) => {
          console.log('Search query:', query);
          console.log('Eligible tools:', tools);

          // Domain knowledge connects "trip planning" to a weather service even
          // though the query does not exactly match its name or description.
          return query.toLowerCase().includes('trip') ? ['getForecast'] : [];
        },
      }),
      getForecast: tool({
        deferLoading: true,
        description: 'Get the weather forecast for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ city, forecast: 'Rain tomorrow.' }),
      }),
      sendEmail: tool({
        deferLoading: true,
        description: 'Send an email message.',
        inputSchema: z.object({ to: z.string(), body: z.string() }),
        execute: async ({ to }) => ({ sent: true, to }),
      }),
    },
    stopWhen: isStepCount(3),
    prompt: 'Help me plan a trip to Bangalore.',
  });

  console.log(result.text);
});
