import { toUIMessageStream } from '@ai-sdk/langchain';
import { AIMessageChunk } from '@langchain/core/messages';
import { readUIMessageStream } from 'ai';
import assert from 'node:assert/strict';

async function* events() {
  yield [
    'messages',
    [
      new AIMessageChunk({
        id: 'message-1',
        content: '',
        tool_call_chunks: [
          {
            id: 'call_reused',
            name: 'write_column',
            args: '{"column":"first"}',
            index: 0,
          },
        ],
      }),
      { langgraph_step: 1 },
    ],
  ];

  yield [
    'messages',
    [
      new AIMessageChunk({
        id: 'message-2',
        content: '',
        tool_call_chunks: [
          {
            id: 'call_reused',
            name: 'deploy_creatives',
            args: '{"column":"second"}',
            index: 0,
          },
        ],
      }),
      { langgraph_step: 2 },
    ],
  ];
}

async function main() {
  const stream = toUIMessageStream(
    events() as unknown as AsyncIterable<AIMessageChunk>,
  );
  const [rawStream, messageStream] = stream.tee();

  const rawChunks = [];
  const rawReader = rawStream.getReader();
  while (true) {
    const { done, value } = await rawReader.read();
    if (done) {
      break;
    }
    rawChunks.push(value);
  }

  let finalMessage;
  for await (const message of readUIMessageStream({
    stream: messageStream,
  })) {
    finalMessage = message;
  }

  const actual = finalMessage?.parts
    .filter(part => part.type === 'dynamic-tool')
    .map(part => ({
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.input,
    }));
  const expected = [
    {
      toolCallId: 'call_reused',
      toolName: 'write_column',
      input: { column: 'first' },
    },
    {
      toolCallId: 'call_reused',
      toolName: 'deploy_creatives',
      input: { column: 'second' },
    },
  ];

  try {
    assert.deepStrictEqual(actual, expected);
  } catch (error) {
    const reportedActual = [expected[0], expected[0]];
    if (
      actual != null &&
      JSON.stringify(actual) === JSON.stringify(reportedActual)
    ) {
      const toolStarts = rawChunks.filter(
        chunk => chunk.type === 'tool-input-start',
      );
      const toolDeltas = rawChunks.filter(
        chunk => chunk.type === 'tool-input-delta',
      );

      console.error(
        'ISSUE_18831_REPRODUCED: later LangGraph step reused the first tool name and input',
      );
      console.error(
        JSON.stringify({ actual, expected, toolStarts, toolDeltas }, null, 2),
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log('ISSUE_18831_FIXED: both tool lifecycles were preserved');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
