import {
  deepSeek,
  type DeepSeekLanguageModelResponsesOptions,
} from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  printFullStream({ result });
});
