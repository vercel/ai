import { createAnthropic } from '@ai-sdk/anthropic';
import { run } from '../lib/run';

// This reproduction uses a synthetic response and does not contact Anthropic.
const provider = createAnthropic({
  apiKey: 'synthetic-test-key',
  headers: { 'anthropic-beta': 'config-beta' },
  fetch: async (_url, init) => {
    console.log(
      'Outgoing anthropic-beta:',
      new Headers(init?.headers).get('anthropic-beta'),
    );
    console.log('Expected: config-beta,request-beta,option-beta');

    return Response.json({
      type: 'message',
      id: 'synthetic-message',
      model: 'claude-3-haiku-20240307',
      content: [{ type: 'text', text: 'Synthetic response.' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  },
});

run(async () => {
  await provider('claude-3-haiku-20240307').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Synthetic prompt.' }],
      },
    ],
    headers: { 'Anthropic-Beta': 'request-beta' },
    providerOptions: { anthropic: { anthropicBeta: ['option-beta'] } },
  });
});
