import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const failureSignal =
  'Issue #17507 reproduced: consecutive tool-message providerOptions were not preserved at their original tool-result boundaries.';

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

async function main() {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
  });

  await generateText({
    model,
    maxRetries: 0,
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'toolCallId1',
            toolName: 'toolName',
            input: {},
          },
          {
            type: 'tool-call',
            toolCallId: 'toolCallId2',
            toolName: 'toolName',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'toolName',
            toolCallId: 'toolCallId1',
            output: { type: 'text', value: 'result1' },
            providerOptions: {
              test: {
                cacheControl: 'part',
                partOnly: true,
              },
            },
          },
        ],
        providerOptions: {
          test: {
            cacheControl: 'first-message',
            messageOnly: true,
          },
        },
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'toolName',
            toolCallId: 'toolCallId2',
            output: { type: 'text', value: 'result2' },
          },
        ],
        providerOptions: {
          test: {
            cacheControl: 'second-message',
          },
        },
      },
    ],
  });

  const toolMessages = model.doGenerateCalls[0].prompt.filter(
    message => message.role === 'tool',
  );
  const combinedToolMessage = toolMessages[0];

  const expected = {
    toolMessageCount: 1,
    firstResultProviderOptions: {
      test: {
        cacheControl: 'part',
        messageOnly: true,
        partOnly: true,
      },
    },
    combinedMessageProviderOptions: {
      test: {
        cacheControl: 'second-message',
      },
    },
  };

  const actual = {
    toolMessageCount: toolMessages.length,
    firstResultProviderOptions:
      combinedToolMessage?.content[0]?.providerOptions,
    combinedMessageProviderOptions: combinedToolMessage?.providerOptions,
  };

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${failureSignal}\n${JSON.stringify({ expected, actual }, null, 2)}`,
    );
  }

  console.log(
    'Issue #17507 is not reproduced: all providerOptions remained at the expected tool-result boundaries.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
