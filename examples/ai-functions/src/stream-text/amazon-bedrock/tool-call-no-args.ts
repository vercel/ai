import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { printFullStream } from '../../lib/print-full-stream';

run(async () => {
  const result = streamText({
    model: amazonBedrock('us.anthropic.claude-sonnet-5'),
    tools: {
      updateIssueList: tool({
        inputSchema: z.object({}),
      }),
    },
    prompt: 'Update the issue list',
  });

  await printFullStream({ result });
});
