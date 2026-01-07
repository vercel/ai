import { cohere, type CohereChatModelOptions } from '@ai-sdk/cohere';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: cohere('command-a-reasoning-08-2025'),
    prompt:
      "Alice has 3 brothers and she also has 2 sisters. How many sisters does Alice's brother have?",
    // optional
    providerOptions: {
      cohere: {
        thinking: {
          type: 'enabled',
          tokenBudget: 1000,
        },
      } satisfies CohereChatModelOptions,
    },
  });

  console.log(JSON.stringify(result.request.body, null, 2));
  console.log(JSON.stringify(result.content, null, 2));
});
