import assert from 'node:assert/strict';
import { createOpenAICompatible } from '../../../../packages/openai-compatible/dist/index.mjs';
import { streamText } from '../../../../packages/ai/dist/index.mjs';

const sseChunks = [
  {
    id: 'chatcmpl-test',
    model: 'glm-5.3-ioa',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: '',
          reasoning_content: 'Think ',
          tool_calls: [],
        },
        finish_reason: '',
      },
    ],
    usage: null,
  },
  {
    id: 'chatcmpl-test',
    model: 'glm-5.3-ioa',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: '',
          reasoning_content: 'more...',
          tool_calls: [],
        },
        finish_reason: '',
      },
    ],
    usage: null,
  },
  {
    id: 'chatcmpl-test',
    model: 'glm-5.3-ioa',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: 'Hello',
          reasoning_content: '',
          tool_calls: [],
        },
        finish_reason: 'stop',
      },
    ],
    usage: null,
  },
];

async function main() {
  const provider = createOpenAICompatible({
    name: 'test-gateway',
    baseURL: 'https://test.invalid/v1',
    apiKey: 'dummy',
    fetch: async () =>
      new Response(
        `${sseChunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      ),
  });

  const result = streamText({
    model: provider.chatModel('glm-5.3-ioa'),
    prompt: 'hi',
  });

  const reasoningEvents: Array<{ type: string; text?: string }> = [];

  for await (const part of result.fullStream) {
    if (part.type.startsWith('reasoning-')) {
      reasoningEvents.push({
        type: part.type,
        ...('text' in part ? { text: part.text } : {}),
      });
    }
  }

  const reasoningStartCount = reasoningEvents.filter(
    event => event.type === 'reasoning-start',
  ).length;
  const reasoningEndCount = reasoningEvents.filter(
    event => event.type === 'reasoning-end',
  ).length;
  const reasoningText = reasoningEvents
    .filter(
      (
        event,
      ): event is {
        type: 'reasoning-delta';
        text: string;
      } => event.type === 'reasoning-delta',
    )
    .map(event => event.text)
    .join('');

  console.log(
    JSON.stringify(
      { reasoningStartCount, reasoningEndCount, reasoningText },
      null,
      2,
    ),
  );

  assert.equal(
    reasoningStartCount,
    1,
    `Issue #20203 reproduced: expected one reasoning-start for one logical reasoning span, received ${reasoningStartCount}`,
  );
  assert.equal(
    reasoningEndCount,
    1,
    `Issue #20203 reproduced: expected one reasoning-end for one logical reasoning span, received ${reasoningEndCount}`,
  );
  assert.equal(reasoningText, 'Think more...');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
