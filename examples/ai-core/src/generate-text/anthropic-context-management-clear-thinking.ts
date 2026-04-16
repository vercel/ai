import { anthropic } from '@ai-sdk/anthropic';
import { generateText, ModelMessage } from 'ai';
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

    const result = await generateText({
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

    console.log('Text:', result.text);

    if (result.reasoningText) {
      console.log(
        'Reasoning:',
        result.reasoningText.substring(0, 100) +
          (result.reasoningText.length > 100 ? '...' : ''),
      );
    }

    const ctxMgmt = result.providerMetadata?.anthropic?.contextManagement;
    if (ctxMgmt) {
      console.log('contextManagement:', JSON.stringify(ctxMgmt, null, 2));
    }

    messages.push(...result.response.messages);
  }
});
