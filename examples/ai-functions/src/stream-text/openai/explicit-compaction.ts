import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: openai.responses('gpt-5.3-codex'),
    messages: [
      {
        role: 'user',
        content:
          'Summarize the deployment discussion into the minimum context needed for the next turn.',
      },
    ],
    providerOptions: {
      openai: {
        store: false,
        compactionTrigger: true,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  let receivedCompaction = false;

  for await (const part of result.fullStream) {
    if (part.type === 'custom' && part.kind === 'openai.compaction') {
      receivedCompaction = true;
      console.log('Received an explicit compaction item.');
    }
  }

  if (!receivedCompaction) {
    throw new Error('OpenAI did not return a compaction item.');
  }
});
