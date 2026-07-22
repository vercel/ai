import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  let repairCalled = false;
  const amazonBedrock = createAmazonBedrock({ region: 'us-west-2' });

  try {
    await generateText({
      model: amazonBedrock('global.anthropic.claude-sonnet-4-5-20250929-v1:0'),
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Read /tmp/data.txt' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: '$READFILE',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName: '$READFILE',
              output: { type: 'text', value: 'Tool not found' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Try something else.' }],
        },
      ],
      tools: {
        answer: tool({
          description: 'Provide an answer.',
          inputSchema: z.object({ text: z.string() }),
        }),
      },
      maxRetries: 0,
      experimental_repairToolCall: async () => {
        repairCalled = true;
        return null;
      },
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      console.error(`Bedrock response: ${error.responseBody}`);
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('[a-zA-Z0-9_-]+') && !repairCalled) {
      console.error(
        'ISSUE_10202_REPRODUCED: Bedrock rejected $READFILE before repairToolCall was invoked',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log(
    repairCalled
      ? 'ISSUE_10202_NOT_REPRODUCED: repairToolCall was invoked'
      : 'ISSUE_10202_NOT_REPRODUCED: request completed without repairToolCall',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
