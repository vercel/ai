import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const chunks = [
  {
    id: 'chatcmpl-issue-20203',
    model: 'test-model',
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
        finish_reason: null,
      },
    ],
  },
  {
    id: 'chatcmpl-issue-20203',
    model: 'test-model',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          content: '',
          reasoning_content: 'more...',
          tool_calls: [],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: 'chatcmpl-issue-20203',
    model: 'test-model',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          content: 'Hello',
          reasoning_content: '',
          tool_calls: [],
        },
        finish_reason: 'stop',
      },
    ],
  },
];

async function main() {
  const provider = createOpenAICompatible({
    name: 'issue-20203-gateway',
    baseURL: 'https://example.invalid/v1',
    apiKey: 'dummy',
    fetch: async () =>
      new Response(
        chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
          'data: [DONE]\n\n',
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      ),
  });

  const result = streamText({
    model: provider.chatModel('test-model'),
    prompt: 'hi',
  });

  const reasoningEvents: string[] = [];
  let reasoningText = '';

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-start' || part.type === 'reasoning-end') {
      reasoningEvents.push(part.type);
    } else if (part.type === 'reasoning-delta') {
      reasoningText += part.text;
    }
  }

  const startCount = reasoningEvents.filter(
    type => type === 'reasoning-start',
  ).length;
  const endCount = reasoningEvents.filter(
    type => type === 'reasoning-end',
  ).length;

  if (startCount !== 1 || endCount !== 1 || reasoningText !== 'Think more...') {
    throw new Error(
      `ISSUE_20203_REPRODUCED: expected one reasoning block, received ${startCount} reasoning-start events and ${endCount} reasoning-end events`,
    );
  }

  console.log('Issue #20203 is not reproduced: reasoning stayed contiguous.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
