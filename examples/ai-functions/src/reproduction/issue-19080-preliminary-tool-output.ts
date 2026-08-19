import assert from 'node:assert/strict';
import { type UIMessage, convertToModelMessages, jsonSchema, tool } from 'ai';

async function main() {
  const preliminaryOutput = {
    status: 'loading' as const,
    message: 'Partial result that must not be sent to the model',
  };

  let toModelOutputCalls = 0;

  const tools = {
    longRunningTask: tool({
      inputSchema: jsonSchema<{ task: string }>({
        type: 'object',
        properties: {
          task: { type: 'string' },
        },
        required: ['task'],
        additionalProperties: false,
      }),
      async *execute() {
        yield preliminaryOutput;
        yield {
          status: 'complete' as const,
          message: 'Final result',
        };
      },
      toModelOutput(output) {
        toModelOutputCalls++;
        return {
          type: 'text',
          value: `MODEL_OUTPUT:${JSON.stringify(output)}`,
        };
      },
    }),
  };

  const persistedMessages: UIMessage[] = [
    {
      id: 'assistant-with-interrupted-tool',
      role: 'assistant',
      parts: [
        {
          type: 'tool-longRunningTask',
          toolCallId: 'tool-call-1',
          state: 'output-available',
          input: { task: 'demo' },
          output: preliminaryOutput,
          preliminary: true,
        },
      ],
    },
    {
      id: 'subsequent-user-message',
      role: 'user',
      parts: [
        { type: 'text', text: 'Continue without the interrupted result.' },
      ],
    },
  ];

  const modelMessages = convertToModelMessages(persistedMessages, {
    ignoreIncompleteToolCalls: true,
    tools,
  });

  assert.deepEqual(modelMessages.at(-1), {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Continue without the interrupted result.',
      },
    ],
  });

  const preliminaryOutputReachedModel = JSON.stringify(modelMessages).includes(
    'Partial result that must not be sent to the model',
  );

  if (preliminaryOutputReachedModel) {
    throw new Error(
      'ISSUE_19080_REPRODUCED: preliminary tool output was sent to the model',
    );
  }

  assert.equal(toModelOutputCalls, 0);
  assert.deepEqual(modelMessages, [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Continue without the interrupted result.',
        },
      ],
    },
  ]);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
