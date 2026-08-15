import {
  deepSeek,
  type DeepSeekLanguageModelResponsesOptions,
} from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    // `deepSeek(...)` uses the Chat Completions API, `deepSeek.responses(...)`
    // the Responses API:
    model: deepSeek.responses('deepseek-v4-flash'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      deepseek: {
        // `none` turns thinking off:
        reasoningEffort: 'max',
      } satisfies DeepSeekLanguageModelResponsesOptions,
    },
  });

  print('Reasoning:', result.reasoningText?.slice(0, 200));
  print('Content:', result.content);
  print('Usage:', result.usage);
});
