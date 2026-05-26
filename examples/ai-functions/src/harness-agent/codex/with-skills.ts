import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  const agent = new HarnessAgent({
    harness: createCodex(),
    sandbox,
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
    process.exit(exitCode);
  }
});
