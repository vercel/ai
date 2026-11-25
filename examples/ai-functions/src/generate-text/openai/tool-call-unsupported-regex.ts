import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z as z4 } from 'zod/v4';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-6-astra'),
    tools: {
      validateEmail: tool({
        description: 'Validate an email address.',
        inputSchema: z4.object({
          email: z4.email(),
        }),
        strict: true,
      }),
    },
    toolChoice: { type: 'tool', toolName: 'validateEmail' },
    prompt: 'Validate the email alice@example.com.',
  });

  print('Tool calls:', result.toolCalls);
  print('Warnings:', result.warnings);
});
