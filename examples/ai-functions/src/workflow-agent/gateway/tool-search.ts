import { WorkflowAgent } from '@ai-sdk/workflow';
import { isStepCount, tool, toolSearch } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const agent = new WorkflowAgent({
    model: 'moonshotai/kimi-k3',
    tools: {
      tool_search: toolSearch(),
      getForecast: tool({
        deferLoading: true,
        description: 'Get the weather forecast for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({
          city,
          forecast: 'Rain tomorrow.',
        }),
      }),
      getStockPrice: tool({
        deferLoading: true,
        description: 'Get the stock price for a ticker symbol.',
        inputSchema: z.object({ ticker: z.string() }),
        execute: async ({ ticker }) => ({ ticker, price: 42 }),
      }),
    },
    stopWhen: isStepCount(5),
  });

  const result = await agent.stream({
    prompt:
      'First search for a weather forecast tool. Then use the discovered tool to tell me whether it will rain in Bangalore tomorrow.',
  });

  const calls = result.steps.map(step =>
    step.toolCalls.map(call => call.toolName),
  );

  console.log('Tool calls by step:', calls);
  console.log(
    'Tool results:',
    result.steps.flatMap(step => step.toolResults),
  );
  console.log('Final text:', result.steps.at(-1)?.text);

  if (calls[0]?.[0] !== 'tool_search') {
    throw new Error('Expected tool_search on the first step.');
  }

  if (!calls.some(step => step.includes('getForecast'))) {
    throw new Error('The discovered getForecast tool was not called.');
  }
});
