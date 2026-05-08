import {
  type ModelMessage,
  generateText,
  isStepCount,
  pruneMessages,
} from 'ai';
import { run } from '../../lib/run';
import { anthropic } from '@ai-sdk/anthropic';
import { JustBashSandbox } from '../../sandbox/just-bash-sandbox';
import { Bash, OverlayFs } from 'just-bash';
import { openai } from '@ai-sdk/openai';

const overlay = new OverlayFs({
  root: process.cwd(),
});

const sandbox = new JustBashSandbox(
  new Bash({
    fs: overlay,
    cwd: overlay.getMountPoint(),
  }),
);

const COMPACTION_THRESHOLD = 8000;
const estimateTokens = (messages: ModelMessage[]) => {
  return JSON.stringify(messages).length / 4;
};

run(async () => {
  const result = await generateText({
    model: openai('gpt-5.5'),
    system: 'You have access to a filesystem. Details: ' + sandbox.description,
    prompt: 'Read every .ts file in this directory',
    sandbox,
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
          // message changes persist over steps now
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
