import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { ToolLoopAgent } from 'ai';
import fs from 'node:fs';
import { print } from '../lib/print';
import { run } from '../lib/run';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

const agent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-5'),
  instructions: {
    role: 'system',
    content: `You are a JavaScript expert that knows everything about the following error message: ${errorMessage}`,
    providerOptions: {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
      } satisfies AnthropicProviderOptions,
    },
  },
});

run(async () => {
  const result = await agent.generate({
    prompt: 'Explain the error message.',
  });

  print('Result:', result.content);
  print('Metadata:', result.providerMetadata?.anthropic);
});
