import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

run(async () => {
  // First call primes the prompt cache and produces a message id we can
  // correlate against on the follow-up request.
  const first = await streamText({
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

  for await (const chunk of first.textStream) {
    process.stdout.write(chunk);
  }

  const firstMessageId = (await first.response).id;
  console.log('\nFirst message id:', firstMessageId);

  // Second call passes cacheDiagnostics.previousMessageId and reads the
  // resolved diagnostics off the finish part's provider metadata.
  const second = await streamText({
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

  for await (const chunk of second.textStream) {
    process.stdout.write(chunk);
  }

  const secondMetadata = await second.providerMetadata;
  console.log('\nCache diagnostics:', secondMetadata?.anthropic?.diagnostics);
});
