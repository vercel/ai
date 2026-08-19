import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    maxOutputTokens: 1024,
    system:
      'Call the advisor before answering, then use its guidance in your response.',
    prompt:
      'Outline a safe rollout plan for replacing a production queue consumer.',
    tools: {
      advisor: anthropic.tools.advisor_20260301({
        model: 'claude-opus-4-8',
        maxUses: 1,
        // Caps each advisor sub-inference independently of maxOutputTokens.
        maxTokens: 2048,
      }),
    },
  });

  console.dir(result.content, { depth: Infinity });
});
