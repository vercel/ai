import assert from 'node:assert/strict';
import { generateText, pruneMessages, streamText, type ModelMessage } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

const usage = {
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

function partTypes(message: ModelMessage | undefined): string[] {
  assert.ok(message, 'expected a message');
  return typeof message.content === 'string'
    ? []
    : message.content.map(part => part.type);
}

function verifyPrunedAssistant({
  label,
  message,
  reasoningFileFailures,
}: {
  label: string;
  message: ModelMessage | undefined;
  reasoningFileFailures: string[];
}) {
  const types = partTypes(message);

  assert.ok(
    !types.includes('reasoning'),
    `${label}: reasoning text was not pruned`,
  );
  assert.ok(types.includes('file'), `${label}: regular file was not preserved`);
  assert.ok(types.includes('text'), `${label}: text was not preserved`);

  if (types.includes('reasoning-file')) {
    reasoningFileFailures.push(label);
  }
}

async function generateResponseMessages() {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [
          { type: 'reasoning', text: 'Intermediate reasoning.' },
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: { type: 'data', data: image },
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: image },
          },
          { type: 'text', text: 'Done.' },
        ],
        finishReason: { raw: 'stop', unified: 'stop' },
        usage,
        warnings: [],
      },
    }),
    prompt: 'Solve the task.',
  });

  return result.responseMessages;
}

async function streamResponseMessages() {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'reasoning-start', id: 'reasoning-1' },
          {
            type: 'reasoning-delta',
            id: 'reasoning-1',
            delta: 'Intermediate reasoning.',
          },
          { type: 'reasoning-end', id: 'reasoning-1' },
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: { type: 'data', data: image },
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: image },
          },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Done.' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { raw: 'stop', unified: 'stop' },
            usage,
          },
        ]),
      },
    }),
    prompt: 'Solve the task.',
  });

  return await result.responseMessages;
}

async function main() {
  const reasoningFileFailures: string[] = [];
  const messages: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'Intermediate reasoning.' },
        {
          type: 'reasoning-file',
          mediaType: 'image/png',
          data: image,
        },
        { type: 'file', mediaType: 'image/png', data: image },
        { type: 'text', text: 'Done.' },
      ],
    },
  ];
  const originalMessages = structuredClone(messages);

  const prunedAll = pruneMessages({ messages, reasoning: 'all' });
  verifyPrunedAssistant({
    label: 'synthetic reasoning=all',
    message: prunedAll[0],
    reasoningFileFailures,
  });
  assert.deepEqual(messages, originalMessages, 'input history was mutated');

  const beforeLastMessages: ModelMessage[] = [
    messages[0],
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'Latest reasoning.' },
        {
          type: 'reasoning-file',
          mediaType: 'image/png',
          data: image,
        },
        { type: 'file', mediaType: 'image/png', data: image },
        { type: 'text', text: 'Latest answer.' },
      ],
    },
  ];
  const prunedBeforeLast = pruneMessages({
    messages: beforeLastMessages,
    reasoning: 'before-last-message',
  });
  verifyPrunedAssistant({
    label: 'synthetic reasoning=before-last-message older message',
    message: prunedBeforeLast[0],
    reasoningFileFailures,
  });
  assert.deepEqual(
    partTypes(prunedBeforeLast[1]),
    ['reasoning', 'reasoning-file', 'file', 'text'],
    'reasoning in the last message was not preserved',
  );

  const emptyAfterPruning = pruneMessages({
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Intermediate reasoning.' },
          {
            type: 'reasoning-file',
            mediaType: 'image/png',
            data: image,
          },
        ],
      },
    ],
    reasoning: 'all',
  });
  if (
    emptyAfterPruning.length === 1 &&
    partTypes(emptyAfterPruning[0]).includes('reasoning-file')
  ) {
    reasoningFileFailures.push('reasoning-only message removal');
  } else {
    assert.deepEqual(
      emptyAfterPruning,
      [],
      'message empty after reasoning pruning was not removed',
    );
  }

  const generatedMessages = await generateResponseMessages();
  assert.deepEqual(
    partTypes(generatedMessages[0]),
    ['reasoning', 'reasoning-file', 'file', 'text'],
    'generateText did not produce the reported response history shape',
  );
  const prunedGenerated = pruneMessages({
    messages: generatedMessages,
    reasoning: 'all',
  });
  verifyPrunedAssistant({
    label: 'generateText responseMessages',
    message: prunedGenerated[0],
    reasoningFileFailures,
  });

  const streamedMessages = await streamResponseMessages();
  assert.deepEqual(
    partTypes(streamedMessages[0]),
    ['reasoning', 'reasoning-file', 'file', 'text'],
    'streamText did not produce the reported response history shape',
  );
  const prunedStreamed = pruneMessages({
    messages: streamedMessages,
    reasoning: 'all',
  });
  verifyPrunedAssistant({
    label: 'streamText responseMessages',
    message: prunedStreamed[0],
    reasoningFileFailures,
  });

  const nextModel = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'Next answer.' }],
      finishReason: { raw: 'stop', unified: 'stop' },
      usage,
      warnings: [],
    },
  });
  await generateText({
    model: nextModel,
    messages: prunedGenerated,
  });
  const forwardedAssistant = nextModel.doGenerateCalls[0]?.prompt.find(
    message => message.role === 'assistant',
  );
  assert.ok(forwardedAssistant, 'pruned assistant history was not sent');
  assert.ok(
    Array.isArray(forwardedAssistant.content),
    'assistant history had unexpected string content',
  );
  if (forwardedAssistant.content.some(part => part.type === 'reasoning-file')) {
    reasoningFileFailures.push('next model call prompt');
  }

  if (reasoningFileFailures.length > 0) {
    throw new Error(
      `ISSUE #21102 REPRODUCED: reasoning-file remained after reasoning pruning (${reasoningFileFailures.join(', ')})`,
    );
  }

  console.log('Issue #21102 is not reproduced.');
}

main();
