import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import assert from 'node:assert/strict';
import { streamText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const finish = (unified: 'length' | 'stop') => ({
  type: 'finish' as const,
  finishReason: { unified, raw: unified },
  usage,
});

const text = (delta: string) => [
  { type: 'text-start' as const, id: 't' },
  { type: 'text-delta' as const, id: 't', delta },
  { type: 'text-end' as const, id: 't' },
];

const lengthStep = [
  {
    type: 'tool-call' as const,
    toolCallId: 'ws_1',
    toolName: 'web_search',
    input: '{"query":"report"}',
    providerExecuted: true,
  },
  {
    type: 'tool-result' as const,
    toolCallId: 'ws_1',
    toolName: 'web_search',
    result: { hits: 3 },
    providerExecuted: true,
  },
  ...text('The report so far'),
  finish('length'),
];

function mockModel(parts: ReadonlyArray<LanguageModelV4StreamPart>) {
  const prompts: LanguageModelV4Prompt[] = [];
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      prompts.push(prompt);
      return {
        warnings: [],
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }
            controller.close();
          },
        }),
      };
    },
  });
  return { model, prompts };
}

const tools = {
  web_search: tool({
    type: 'provider' as const,
    id: 'test.web_search',
    args: {},
    isProviderExecuted: true,
    inputSchema: z.object({ query: z.string() }),
  }),
};

type MessageWithContent = {
  content:
    | string
    | ReadonlyArray<{
        type: string;
        toolCallId?: string;
      }>;
};

function unpairedCalls(messages: ReadonlyArray<MessageWithContent>) {
  const parts = messages.flatMap(message =>
    typeof message.content === 'string' ? [] : message.content,
  );
  const results = new Set(
    parts
      .filter(part => part.type === 'tool-result')
      .map(part => part.toolCallId),
  );
  return parts
    .filter(
      part =>
        part.type === 'tool-call' &&
        part.toolCallId != null &&
        !results.has(part.toolCallId),
    )
    .map(part => part.toolCallId);
}

async function main() {
  const core = streamText({
    model: mockModel(lengthStep).model,
    tools,
    prompt: 'Write a long report.',
  });
  await core.consumeStream();
  const coreMessages = (await core.response).messages;
  assert.deepEqual(
    unpairedCalls(coreMessages),
    [],
    'control: streamText must keep provider-executed calls paired',
  );

  const result = await new WorkflowAgent({
    model: mockModel(lengthStep).model,
    tools,
  }).stream({
    prompt: 'Write a long report.',
  });

  const next = mockModel([...text('ok'), finish('stop')]);
  await new WorkflowAgent({ model: next.model, tools }).stream({
    messages: [
      ...result.messages,
      { role: 'user' as const, content: 'Continue.' },
    ],
  });

  const sentAssistantMessages =
    next.prompts[0]?.filter(message => message.role === 'assistant') ?? [];
  const returnedUnpaired = unpairedCalls(result.messages);
  const sentUnpaired = unpairedCalls(sentAssistantMessages);

  if (returnedUnpaired.includes('ws_1') || sentUnpaired.includes('ws_1')) {
    throw new Error(
      'ISSUE_22085_REPRODUCED: WorkflowAgent returned or continued with provider-executed tool call ws_1 without its result',
    );
  }

  assert.deepEqual(
    returnedUnpaired,
    [],
    'WorkflowAgent messages must pair provider-executed calls and results',
  );
  assert.deepEqual(
    sentUnpaired,
    [],
    'continued model prompt must pair provider-executed calls and results',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
