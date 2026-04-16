import { anthropic } from '@ai-sdk/anthropic';
import { streamText, ModelMessage } from 'ai';
import { run } from '../lib/run';

const userPrompts = [
  'What is 25 * 4?',
  'Now multiply that by 3.',
  'Now divide by 6.',
  'Now add 17.',
  'What were all the results so far? Summarize briefly.',
];

run(async () => {
  const messages: ModelMessage[] = [];

  for (const userPrompt of userPrompts) {
    console.log(`\n--- User: ${userPrompt} ---`);
    messages.push({ role: 'user', content: userPrompt });

    const result = streamText({
      model: anthropic('claude-haiku-4-5'),
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 10000 },
          contextManagement: {
            edits: [
              {
                type: 'clear_thinking_20251015',
                keep: { type: 'thinking_turns', value: 1 },
              },
            ],
          },
        },
      },
      messages,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
      } else if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      }
    }

    console.log();

    const providerMetadata = await result.providerMetadata;
    const ctxMgmt = providerMetadata?.anthropic?.contextManagement;
    if (ctxMgmt) {
      console.log('contextManagement:', JSON.stringify(ctxMgmt, null, 2));
    }

    const response = await result.response;
    messages.push(...response.messages);
  }
});
