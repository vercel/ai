import assert from 'node:assert/strict';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  isStepCount,
  isToolUIPart,
  readUIMessageStream,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  MockLanguageModelV4,
} from 'ai/test';
import { z } from 'zod';

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

async function main() {
  let toolExecuted = false;
  let modelSawExecutionDenied = false;

  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      modelSawExecutionDenied =
        modelSawExecutionDenied ||
        JSON.stringify(prompt).includes('execution-denied');

      const streamParts: LanguageModelV4StreamPart[] = modelSawExecutionDenied
        ? [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: 'Denied; the tool was not executed.',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]
        : [
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'bash',
              input: JSON.stringify({ command: 'git push' }),
            },
            {
              type: 'finish',
              finishReason: {
                unified: 'tool-calls',
                raw: 'tool-calls',
              },
              usage,
            },
          ];

      return {
        stream: convertArrayToReadableStream(streamParts),
      };
    },
  });

  const result = streamText({
    model,
    tools: {
      bash: tool({
        inputSchema: z.object({ command: z.string() }),
        execute: async () => {
          toolExecuted = true;
          return 'should never run';
        },
      }),
    },
    toolApproval: {
      bash: async () => ({
        type: 'denied',
        reason: 'blocked by server policy',
      }),
    },
    messages: [{ role: 'user', content: 'push it' }],
    stopWhen: isStepCount(3),
  });

  const [chunkStream, messageStream] = result.toUIMessageStream().tee();
  const [chunks, messageSnapshots] = await Promise.all([
    convertReadableStreamToArray(chunkStream),
    collect(
      readUIMessageStream({
        stream: messageStream,
      }) as AsyncIterable<UIMessage>,
    ),
  ]);

  const chunkTypes = chunks.map(chunk => chunk.type);
  const approvalRequestIndex = chunkTypes.indexOf('tool-approval-request');
  const approvalResponseIndex = chunkTypes.indexOf('tool-approval-response');
  const outputDeniedIndex = chunkTypes.indexOf('tool-output-denied');

  assert.notEqual(
    approvalRequestIndex,
    -1,
    'precondition failed: automatic approval request was not emitted',
  );
  assert.equal(
    approvalResponseIndex,
    approvalRequestIndex + 1,
    'precondition failed: denied approval response did not follow the request',
  );
  assert.equal(
    chunks[approvalResponseIndex]?.type,
    'tool-approval-response',
    'precondition failed: approval response chunk is missing',
  );
  assert.equal(
    chunks[approvalResponseIndex]?.approved,
    false,
    'precondition failed: toolApproval did not deny the call',
  );
  assert.equal(
    toolExecuted,
    false,
    'precondition failed: the denied tool unexpectedly executed',
  );
  assert.equal(
    modelSawExecutionDenied,
    true,
    'precondition failed: the model did not receive execution-denied',
  );
  assert.equal(
    await result.text,
    'Denied; the tool was not executed.',
    'precondition failed: the model did not continue after denial',
  );

  const finalMessage = messageSnapshots.at(-1);
  const toolPart = finalMessage?.parts
    .filter(isToolUIPart)
    .find(part => part.toolCallId === 'call-1');
  const finalToolState = toolPart?.state;

  console.log(`UI stream chunk types: ${chunkTypes.join(', ')}`);
  console.log(`Final tool state: ${finalToolState ?? 'missing'}`);

  if (
    outputDeniedIndex !== approvalResponseIndex + 1 ||
    finalToolState !== 'output-denied'
  ) {
    throw new Error(
      'ISSUE_20768_REPRODUCED: same-stream automatic denial omitted tool-output-denied and left the UI tool part in approval-responded',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
