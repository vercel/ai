import { openai, type OpenAIToolOptions } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const inventoryOutputSchema: NonNullable<OpenAIToolOptions['outputSchema']> = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    availableUnits: { type: 'number' },
  },
  required: ['sku', 'availableUnits'],
  additionalProperties: false,
};

const demandOutputSchema: NonNullable<OpenAIToolOptions['outputSchema']> = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    requestedUnits: { type: 'number' },
  },
  required: ['sku', 'requestedUnits'],
  additionalProperties: false,
};

run(async () => {
  const result = await generateText({
    model: openai('gpt-5.6'),
    stopWhen: isStepCount(10),
    prompt:
      'Compare inventory with demand for sku_123. Use a hosted JavaScript program to call both tools in parallel, then return whether inventory is sufficient.',
    tools: {
      program: openai.tools.programmaticToolCalling(),
      getInventory: tool({
        description: 'Get available inventory for a SKU.',
        inputSchema: z.object({ sku: z.string() }),
        execute: async ({ sku }) => ({ sku, availableUnits: 42 }),
        providerOptions: {
          openai: {
            allowedCallers: ['programmatic'],
            outputSchema: inventoryOutputSchema,
          } satisfies OpenAIToolOptions,
        },
      }),
      getDemand: tool({
        description: 'Get requested units for a SKU.',
        inputSchema: z.object({ sku: z.string() }),
        execute: async ({ sku }) => ({ sku, requestedUnits: 31 }),
        providerOptions: {
          openai: {
            allowedCallers: ['programmatic'],
            outputSchema: demandOutputSchema,
          } satisfies OpenAIToolOptions,
        },
      }),
    },
    providerOptions: {
      openai: {
        store: false,
      },
    },
    include: {
      responseBody: true,
    },
  });

  console.log(JSON.stringify(result.content, null, 2));

  return result;
});
