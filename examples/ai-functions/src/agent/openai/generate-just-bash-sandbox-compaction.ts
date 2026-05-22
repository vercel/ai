import {
  type ModelMessage,
  generateText,
  isStepCount,
  pruneMessages,
} from 'ai';
import { run } from '../../lib/run';
import { anthropic } from '@ai-sdk/anthropic';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { OverlayFs, Sandbox } from 'just-bash';
import { openai } from '@ai-sdk/openai';

const COMPACTION_THRESHOLD = 8000;
const estimateTokens = (messages: ModelMessage[]) => {
  return JSON.stringify(messages).length / 4;
};

run(async () => {
  const overlay = new OverlayFs({ root: process.cwd() });
  const handle = await createJustBashSandbox({
    sandbox: await Sandbox.create({
      fs: overlay,
      cwd: overlay.getMountPoint(),
    }),
  }).create();

  const result = await generateText({
    model: openai('gpt-5.5'),
    instructions:
      'You have access to a filesystem. Details: ' + handle.session.description,
    prompt: 'Read every .ts file in this directory',
    experimental_sandbox: handle.session,
    tools: {
      bash: anthropic.tools.bash_20250124(),
    },
    stopWhen: isStepCount(10),
    prepareStep: ({ messages, stepNumber }) => {
      console.log('\nStep number:', stepNumber);

      const tokenCount = estimateTokens(messages);
      console.log('Estimated token count:', tokenCount);

      if (tokenCount > COMPACTION_THRESHOLD) {
        console.log('Compacting messages...');
        return {
          messages: pruneMessages({
            messages,
            reasoning: 'all',
            toolCalls: 'before-last-2-messages',
            emptyMessages: 'remove',
          }),
        };
      }
    },
  });

  console.log(result.text);
});
