import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { LanguageModel, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';

const agent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  callOptionsSchema: z.object({
    model: z.custom<LanguageModel>(),
    city: z.string(),
    region: z.string(),
    reasoningEffort: z.enum(['low', 'medium', 'high']),
  }),
  tools: {
    web_search: openai.tools.webSearch(),
  },
  prepareCall: ({ options, ...rest }) => ({
    ...rest,
    model: options?.model ?? openai('gpt-5-mini'),
    providerOptions: {
      openai: {
        reasoningEffort: options?.reasoningEffort ?? 'medium',
        reasoningSummary: 'detailed',
      } satisfies OpenAIResponsesProviderOptions,
    },
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'low',
        userLocation: {
          type: 'approximate',
          city: options?.city,
          region: options?.region,
          country: 'US',
        },
      }),
    },
  }),
  onStepFinish: ({ request }) => {
    console.log();
    print('REQUEST:', request.body);
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'What news did happen here yesterday?',
    options: {
      model: openai('gpt-5-nano'),
      city: 'San Francisco',
      region: 'California',
      reasoningEffort: 'low',
    },
  });

  await printFullStream({ result });
});
