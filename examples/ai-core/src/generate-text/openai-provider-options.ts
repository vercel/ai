import { openai, type OpenAILanguageModelOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      opentai: {
        logitBias: {},
        logprobs: 1,
        parallelToolCalls: false,
        user: '<user_id>',
        reasoningEffort: 'minimal',
        maxCompletionTokens: 100,
        store: false,
        metadata: {},
        prediction: {},
        structuredOutputs: false,
        serviceTier: 'auto',
        strictJsonSchema: false,
        textVerbosity: 'low',
        promptCacheKey: '<prompt_cache_key>',
        safetyIdentifier: '<safety_identifier>',
        // @ts-expect-error
        invalidOption: null,
      } satisfies OpenAILanguageModelOptions,
    },
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
