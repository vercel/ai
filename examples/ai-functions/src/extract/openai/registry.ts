import { openai } from '@ai-sdk/openai';
import {
  createProviderRegistry,
  customProvider,
  experimental_extract,
} from 'ai';
import { run } from '../../lib/run';

const registry = createProviderRegistry({
  invoices: customProvider({
    extractionModels: {
      fast: openai.extractionModel('gpt-6.1-sol'),
      careful: openai.extractionModel('gpt-6-luna'),
    },
    fallbackProvider: openai,
  }),
});

run(async () => {
  globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
    extractionModels: { careful: registry.extractionModel('invoices:careful') },
  });
  const state = 'Invoice INV-2041, total due $1,250.00 by March 3.';
  const fields = {
    invoiceNumber: { type: 'text' },
    total: { type: 'number', decimals: 2 },
  } as const;

  for (const model of [
    registry.extractionModel('invoices:fast'),
    registry.extractionModel('invoices:gpt-6.1-sol'),
    'careful',
  ]) {
    const result = await experimental_extract({ model, state, fields });
    console.log(result.response.modelId, result.answers);
  }
});
