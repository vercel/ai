import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, pruneMessages, tool, type ModelMessage } from 'ai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

async function main() {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/anthropic/src/__fixtures__/issue-13430-thinking-tool-call.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    content: [
      { type: 'thinking'; thinking: string; signature: string },
      {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, never>;
      },
    ];
  };

  const requestBodies: Array<{
    messages?: Array<{
      role: string;
      content: Array<{ type: string }>;
    }>;
  }> = [];
  const anthropic = createAnthropic({
    fetch: async (url, init) => {
      requestBodies.push(JSON.parse(init!.body as string));
      return fetch(url, init);
    },
  });

  const [thinking, toolUse] = fixture.content;

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content:
        'Call checkSandboxErrors now. Do not answer the request without calling the tool.',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: thinking.thinking,
          providerOptions: {
            anthropic: {
              signature: thinking.signature,
            },
          },
        },
        {
          type: 'tool-call',
          toolCallId: toolUse.id,
          toolName: toolUse.name,
          input: toolUse.input,
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: toolUse.id,
          toolName: toolUse.name,
          output: {
            type: 'json',
            value: { errors: [] },
          },
        },
      ],
    },
    {
      role: 'user',
      content: 'Continue.',
    },
  ];

  const pruned = pruneMessages({
    messages,
    toolCalls: [
      {
        type: 'before-last-message',
        tools: ['checkSandboxErrors'],
      },
    ],
    emptyMessages: 'remove',
  });

  const reasoningOnlyMessage = pruned.find(
    message =>
      message.role === 'assistant' &&
      typeof message.content !== 'string' &&
      message.content.length > 0 &&
      message.content.every(part => part.type === 'reasoning'),
  );

  assert.ok(
    reasoningOnlyMessage,
    'Expected pruneMessages to leave a reasoning-only assistant message',
  );

  await generateText({
    model: anthropic('claude-sonnet-4-6'),
    maxOutputTokens: 32,
    messages: pruned,
    tools: {
      checkSandboxErrors: tool({
        description: 'Check the sandbox for errors.',
        inputSchema: z.object({}),
      }),
    },
  });

  const sentAssistantMessage = requestBodies
    .at(-1)
    ?.messages?.find(message => message.role === 'assistant');
  assert.ok(
    sentAssistantMessage,
    'Expected an assistant message in the request',
  );
  assert.ok(
    sentAssistantMessage.content.length > 0 &&
      sentAssistantMessage.content.every(part => part.type === 'thinking'),
    'Expected the Anthropic request to contain only a thinking block for the pruned assistant message',
  );

  await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    maxOutputTokens: 32,
    messages: pruned,
    tools: {
      checkSandboxErrors: tool({
        description: 'Check the sandbox for errors.',
        inputSchema: z.object({}),
      }),
    },
  });

  console.log(
    'Could not reproduce issue #13430: Anthropic and AI Gateway accepted the reasoning-only assistant message.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
