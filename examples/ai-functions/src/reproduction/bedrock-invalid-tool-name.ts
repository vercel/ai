import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, jsonSchema, tool } from 'ai';

const VALIDATION_SIGNAL =
  'failed to satisfy constraint: Member must satisfy regular expression pattern: [a-zA-Z0-9_-]+';

async function main() {
  const bedrock = createAmazonBedrock({ region: 'us-west-2' });
  let repairCalled = false;

  try {
    await generateText({
      model: bedrock('global.anthropic.claude-sonnet-4-5-20250929-v1:0'),
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
          description: 'Provide an answer',
          inputSchema: jsonSchema<{ text: string }>({
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          }),
          execute: async ({ text }) => text,
        }),
      },
      experimental_repairToolCall: async () => {
        repairCalled = true;
        return null;
      },
    });

    console.log(
      'Request completed without a Bedrock tool-name validation crash.',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes(VALIDATION_SIGNAL) && !repairCalled) {
      if (APICallError.isInstance(error)) {
        console.error(`LIVE_RESPONSE_BODY: ${error.responseBody}`);
      }
      console.error(
        `BEDROCK_INVALID_TOOL_NAME_CRASH: ${message}; repairCalled=${repairCalled}`,
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
