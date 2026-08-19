import { readUIMessageStream } from 'ai';
import { toUIMessageStream } from '../../../../packages/langchain';

async function* events() {
  yield [
    'messages',
    [
      {
        id: 'message-1',
        type: 'ai',
        content: '',
        tool_call_chunks: [
          {
            id: 'call_reused',
            name: 'write_column',
            args: '{"column":"first"}',
            index: 0,
          },
        ],
      },
      { langgraph_step: 1 },
    ],
  ];

  yield [
    'messages',
    [
      {
        id: 'message-2',
        type: 'ai',
        content: '',
        tool_call_chunks: [
          {
            id: 'call_reused',
            name: 'deploy_creatives',
            args: '{"column":"second"}',
            index: 0,
          },
        ],
      },
      { langgraph_step: 2 },
    ],
  ];
}

async function main() {
  let finalMessage;

  for await (const message of readUIMessageStream({
    stream: toUIMessageStream(
      events() as Parameters<typeof toUIMessageStream>[0],
    ),
  })) {
    finalMessage = message;
  }

  const toolParts = finalMessage?.parts.filter(
    part => part.type === 'dynamic-tool',
  );
  const actual = toolParts?.map(part => ({
    toolName: part.toolName,
    input: part.input,
  }));
  const expected = [
    {
      toolName: 'write_column',
      input: { column: 'first' },
    },
    {
      toolName: 'deploy_creatives',
      input: { column: 'second' },
    },
  ];

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(
      'ISSUE_18831_REPRODUCED: the later LangGraph step lost its reused tool-call lifecycle.',
    );
    console.error('Expected:', JSON.stringify(expected));
    console.error('Actual:', JSON.stringify(actual));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Reproduction harness failed:', error);
  process.exitCode = 2;
});
