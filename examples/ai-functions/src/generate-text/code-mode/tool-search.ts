import { experimental_codeModeTool as codeModeTool } from '@ai-sdk/code-mode';
import { generateText, isStepCount, tool, toolSearch } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: 'moonshotai/kimi-k3',
    tools: {
      code_mode: codeModeTool({ toolDiscovery: 'conversation' }),
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
    experimental_toolCallers: {
      tool_search: ['code_mode'],
      getForecast: ['code_mode'],
      getStockPrice: ['code_mode'],
    },
    stopWhen: isStepCount(5),
    prompt: 'Will it rain in Bangalore tomorrow? Use the available tools.',
    onStepStart: ({ stepNumber, messages }) => {
      // The first catalog contains only tool_search. After searching, a new
      // catalog adds the matching tool's signature without exposing stock tools.
      console.log(`Step ${stepNumber}:`, JSON.stringify(messages, null, 2));
    },
  });

  console.log(result.text);
});
