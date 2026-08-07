import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

run(async () => {
  // First call primes the prompt cache and produces a message id we can
  // correlate against on the follow-up request.
  const first = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'You are a JavaScript expert.',
          },
          {
            type: 'text',
            text: `Error message: ${errorMessage}`,
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral', ttl: '1h' },
              } satisfies AnthropicLanguageModelOptions,
            },
          },
          {
            type: 'text',
            text: 'Explain the error message.',
          },
        ],
      },
    ],
  });

  const firstMessageId = first.response.id;
  console.log('First message id:', firstMessageId);

  // Second call passes cacheDiagnostics.previousMessageId and reads the
  // resolved diagnostics off the provider metadata.
  const second = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'You are a JavaScript expert.',
          },
          {
            type: 'text',
            text: `Error message: ${errorMessage}`,
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral', ttl: '1h' },
              } satisfies AnthropicLanguageModelOptions,
            },
          },
          {
            type: 'text',
            text: 'Repeat the explanation as a one-liner.',
          },
        ],
      },
    ],
    providerOptions: {
      anthropic: {
        cacheDiagnostics: {
          previousMessageId: firstMessageId,
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  console.log(second.text);
  console.log();

  console.log(
    'Cache diagnostics:',
    second.providerMetadata?.anthropic?.diagnostics,
  );
});
