import type { ModelMessage } from '@ai-sdk/provider-utils';
import { generateText, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const providerOptions = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
};

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

const messages: ModelMessage[] = [
  { role: 'user', content: 'go' },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'echo',
        input: { t: 'x' },
      },
      {
        type: 'tool-approval-request',
        approvalId: 'a1',
        toolCallId: 'c1',
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId: 'a1',
        approved: true,
      },
    ],
    providerOptions,
  },
];

function hasCacheControl(value: unknown): value is {
  providerOptions: {
    anthropic: { cacheControl: { type: 'ephemeral' } };
  };
} {
  const options = (value as { providerOptions?: unknown } | null)
    ?.providerOptions as
    | {
        anthropic?: {
          cacheControl?: {
            type?: unknown;
          };
        };
      }
    | undefined;

  return options?.anthropic?.cacheControl?.type === 'ephemeral';
}

function inspectPrompt(api: string, prompt: unknown[]) {
  const lastMessage = prompt.at(-1) as
    | {
        role?: unknown;
        content?: unknown;
      }
    | undefined;

  if (
    lastMessage?.role !== 'tool' ||
    !Array.isArray(lastMessage.content) ||
    !lastMessage.content.some(
      part =>
        (part as { type?: unknown }).type === 'tool-result' &&
        (part as { toolCallId?: unknown }).toolCallId === 'c1',
    )
  ) {
    throw new Error(
      `Reproduction setup failed for ${api}: the approved local tool result did not reach the model prompt.`,
    );
  }

  return {
    api,
    lastMessage,
    preserved:
      hasCacheControl(lastMessage) ||
      lastMessage.content.some(part => hasCacheControl(part)),
  };
}

async function main() {
  let executionCount = 0;
  const tools = {
    echo: tool({
      inputSchema: z.object({ t: z.string() }),
      needsApproval: true,
      execute: async ({ t }) => {
        executionCount++;
        return t;
      },
    }),
  };

  const generateModel = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    }),
  });

  await generateText({
    model: generateModel,
    tools,
    messages,
  });

  const streamModel = new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  await streamText({
    model: streamModel,
    tools,
    messages,
  }).consumeStream();

  if (executionCount !== 2) {
    throw new Error(
      `Reproduction setup failed: expected two approved local tool executions, received ${executionCount}.`,
    );
  }

  const results = [
    inspectPrompt('generateText', generateModel.doGenerateCalls[0].prompt),
    inspectPrompt('streamText', streamModel.doStreamCalls[0].prompt),
  ];

  console.log(JSON.stringify(results, null, 2));

  const affectedApis = results
    .filter(result => !result.preserved)
    .map(result => result.api);

  if (affectedApis.length > 0) {
    throw new Error(
      `ISSUE_22173_REPRODUCED: providerOptions missing after approved tool execution for ${affectedApis.join(
        ', ',
      )}`,
    );
  }

  console.log(
    'Issue #22173 not reproduced: providerOptions survived approved tool execution.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
