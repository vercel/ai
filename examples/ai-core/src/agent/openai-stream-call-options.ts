import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { LanguageModel, ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { printFullStream } from '../lib/print-full-stream';
import { print } from '../lib/print';

const agent = new ToolLoopAgent<{
  model: LanguageModel;
  city: string;
  region: string;
  reasoningEffort: 'low' | 'medium' | 'high';
}>({
  model: openai('gpt-5-mini'),
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
  const result = agent.stream({
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
