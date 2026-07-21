import type { LanguageModelV3, LanguageModelV3Prompt } from '@ai-sdk/provider';
import { generateText, type ModelMessage } from 'ai';

const firstMessageProviderOptions = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
  test: {
    conflict: 'message',
    firstMessageOnly: true,
  },
};

const firstPartProviderOptions = {
  test: {
    conflict: 'part',
  },
};

const secondMessageProviderOptions = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
  test: {
    secondMessageOnly: true,
  },
};

async function main() {
  let providerPrompt: LanguageModelV3Prompt | undefined;

  const model = {
    specificationVersion: 'v3',
    provider: 'reproduction',
    modelId: 'issue-17507',
    supportedUrls: {},
    async doGenerate({ prompt }) {
      providerPrompt = prompt;

      return {
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: {
            total: 0,
            noCache: 0,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 0,
            text: 0,
            reasoning: undefined,
          },
        },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error('doStream is not used by this reproduction.');
    },
  } satisfies LanguageModelV3;

  const messages: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool-1',
          input: {},
        },
        {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'tool-2',
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      providerOptions: firstMessageProviderOptions,
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool-1',
          output: { type: 'text', value: 'first result' },
          providerOptions: firstPartProviderOptions,
        },
      ],
    },
    {
      role: 'tool',
      providerOptions: secondMessageProviderOptions,
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-2',
          toolName: 'tool-2',
          output: { type: 'text', value: 'second result' },
        },
      ],
    },
  ];

  await generateText({ model, messages });

  const toolMessages =
    providerPrompt?.filter(message => message.role === 'tool') ?? [];
  const combinedToolMessage = toolMessages[0];
  const observed = {
    toolMessageCount: toolMessages.length,
    combinedMessageProviderOptions: combinedToolMessage?.providerOptions,
    firstResultProviderOptions:
      combinedToolMessage?.content[0]?.providerOptions,
    secondResultProviderOptions:
      combinedToolMessage?.content[1]?.providerOptions,
  };
  const expected = {
    toolMessageCount: 1,
    combinedMessageProviderOptions: secondMessageProviderOptions,
    firstResultProviderOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
      test: {
        conflict: 'part',
        firstMessageOnly: true,
      },
    },
    secondResultProviderOptions: undefined,
  };

  console.log(JSON.stringify({ observed, expected }, null, 2));

  if (
    JSON.stringify(observed.combinedMessageProviderOptions) !==
    JSON.stringify(secondMessageProviderOptions)
  ) {
    throw new Error(
      'Reproduced issue #17507: consecutive tool messages lost providerOptions from the second message.',
    );
  }

  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(
      'Consecutive tool messages did not preserve providerOptions at their original message boundaries with part-level precedence.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
