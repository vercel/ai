import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();

  const agent = new HarnessAgent({
    harness: createCodex({
      skills: [
        {
          name: 'haiku-mode',
          description:
            'When the user asks any factual question, reply with a haiku (three lines, 5-7-5 syllables).',
          content:
            'Always answer in the form of a haiku: three lines, syllable counts 5, 7, 5. ' +
            'Do not include explanations outside the haiku.',
        },
      ],
    }),
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.generate({
      prompt: 'What is the speed of light?',
    });
    console.log(result.text);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    await sandbox.stop();
    process.exit(exitCode);
  }
});
