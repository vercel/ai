import { generateText, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const expectedProviderOptions = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
};

const messages = [
  { role: 'user' as const, content: 'go' },
  {
    role: 'assistant' as const,
    content: [
      {
        type: 'tool-call' as const,
        toolCallId: 'c1',
        toolName: 'echo',
        input: { t: 'x' },
      },
      {
        type: 'tool-approval-request' as const,
        approvalId: 'a1',
        toolCallId: 'c1',
      },
    ],
  },
  {
    role: 'tool' as const,
    content: [
      {
        type: 'tool-approval-response' as const,
        approvalId: 'a1',
        approved: true,
      },
    ],
    providerOptions: expectedProviderOptions,
  },
];

const tools = {
  echo: tool({
    inputSchema: z.object({ t: z.string() }),
    needsApproval: true,
    execute: async ({ t }) => t,
  }),
};

function hasExpectedProviderOptions(value: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(expectedProviderOptions);
}

function approvalOptionsWerePreserved({
  api,
  prompt,
}: {
  api: string;
  prompt: unknown[];
}): boolean {
  const lastMessage = prompt.at(-1);

  if (
    lastMessage == null ||
    typeof lastMessage !== 'object' ||
    !('role' in lastMessage) ||
    lastMessage.role !== 'tool' ||
    !('content' in lastMessage) ||
    !Array.isArray(lastMessage.content)
  ) {
    throw new Error(
      `Reproduction setup failed for ${api}: the final prompt message was not a tool message.`,
    );
  }

  const toolResult = lastMessage.content.find(
    part =>
      part != null &&
      typeof part === 'object' &&
      'type' in part &&
      part.type === 'tool-result' &&
      'toolCallId' in part &&
      part.toolCallId === 'c1',
  );

  if (toolResult == null) {
    throw new Error(
      `Reproduction setup failed for ${api}: the approved tool did not produce a tool result.`,
    );
  }

  const messageProviderOptions =
    'providerOptions' in lastMessage ? lastMessage.providerOptions : undefined;
  const partProviderOptions =
    'providerOptions' in toolResult ? toolResult.providerOptions : undefined;

  console.log(`${api} final tool message: ${JSON.stringify(lastMessage)}`);

  return (
    hasExpectedProviderOptions(messageProviderOptions) ||
    hasExpectedProviderOptions(partProviderOptions)
  );
}

async function main() {
  const generateModel = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });

  await generateText({
    model: generateModel,
    tools,
    messages,
  });

  const streamModel = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'ok' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      ]),
    }),
  });

  const streamResult = streamText({
    model: streamModel,
    tools,
    messages,
  });
  await streamResult.consumeStream();

  const affectedApis = [
    {
      api: 'generateText',
      prompt: generateModel.doGenerateCalls[0]?.prompt,
    },
    {
      api: 'streamText',
      prompt: streamModel.doStreamCalls[0]?.prompt,
    },
  ].filter(({ api, prompt }) => {
    if (prompt == null) {
      throw new Error(
        `Reproduction setup failed for ${api}: the model was not called.`,
      );
    }

    return !approvalOptionsWerePreserved({ api, prompt });
  });

  if (affectedApis.length > 0) {
    console.error(
      'ISSUE #22173 REPRODUCED: providerOptions were dropped after an approved local tool execution.',
    );
    console.error(
      `Affected APIs: ${affectedApis.map(({ api }) => api).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #22173 was not reproduced: providerOptions remained on the executed tool result.',
  );
}

await main();
