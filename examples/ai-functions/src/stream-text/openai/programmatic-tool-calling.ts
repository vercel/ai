import { openai, type OpenAIToolOptions } from '@ai-sdk/openai';
import { isStepCount, streamText, tool } from 'ai';
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
  let stepIndex = 0;

  const result = streamText({
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
      rawChunks: true,
    },
    onStepFinish: async ({ request, response }) => {
      stepIndex++;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`STEP ${stepIndex}`);
      console.log(`${'='.repeat(60)}`);
    },
  });

  console.log('\nStreaming:');
  for await (const part of result.stream) {
    console.log(JSON.stringify(part, null, 2));
  }

  const [text, steps] = await Promise.all([result.text, result.steps]);

  console.log(`\n\n${'='.repeat(60)}`);
  console.log('FINAL RESULT');
  console.log(`${'='.repeat(60)}`);
  console.log('Text:', text);
  console.log('Steps:', steps.length);

  return result;
});
