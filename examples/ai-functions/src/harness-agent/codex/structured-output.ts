import { HarnessAgent } from '@ai-sdk/harness/agent';
import { codex } from '@ai-sdk/harness-codex';
import { Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: codex,
    sandbox,
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt:
        'Classify the sentiment of this review: "The setup was painful but it works great now."',
      output: Output.object({
        schema: z.object({
          sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
          confidence: z.number(),
          summary: z.string(),
        }),
      }),
    });

    // `result.output` is typed and validated against the schema.
    console.log('output:', result.output);
    console.log('sentiment:', result.output.sentiment);
    console.log('finishReason:', result.finishReason);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
