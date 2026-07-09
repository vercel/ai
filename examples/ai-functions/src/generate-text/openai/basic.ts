import {
  openai,
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

const myOpenai = createOpenAI({
  fetch: async function customFetch(url, input) {
    /* @ts-ignore */
    console.dir(JSON.parse(input?.body), { depth: Infinity });
    return fetch(url, input);
  },
});

run(async () => {
  const result = await generateText({
    model: myOpenai('gpt-5.6'),
    prompt:
      'How many "r"s are in the word "strawberry", and what is the square root of 144? Then, how much is the product of both of the resulting values? Think hard about it. Only respond with the resulting final number, nothing more.',
    providerOptions: {
      openai: {
        // reasoningEffort: '',
        reasoningEffort: '',
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
  print('Finish reason:', result.finishReason);
  print('Raw finish reason:', result.rawFinishReason);
});
