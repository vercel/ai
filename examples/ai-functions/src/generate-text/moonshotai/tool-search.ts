import { generateText, isStepCount, tool, toolSearch } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: 'moonshotai/kimi-k3',
    tools: {
      tool_search: toolSearch(),
      getForecast: tool({
        deferLoading: true,
        description: 'Get the weather forecast for a city.',
        inputSchema: z.object({ city: z.string() }),
        outputSchema: z.object({ city: z.string(), forecast: z.string() }),
        execute: async ({ city }) => ({ city, forecast: 'Rain tomorrow.' }),
      }),
      getStockPrice: tool({
        deferLoading: true,
        description: 'Get the stock price for a ticker symbol.',
        inputSchema: z.object({ ticker: z.string() }),
        outputSchema: z.object({ ticker: z.string(), price: z.number() }),
        execute: async ({ ticker }) => ({ ticker, price: 42 }),
      }),
    },
    stopWhen: isStepCount(5),
    prompt: 'Will it rain in Bangalore tomorrow? Use the available tools.',
    // The first step sees only tool_search. Matching tools become directly
    // callable on the next step, changing the provider-visible tool definitions.
    onStepEnd: ({ content }) => {
      console.log('Step content:', JSON.stringify(content, null, 2));
    },
  });

  console.log(result.text);
});
