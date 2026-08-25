import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  convertToModelMessages,
  extractReasoningMiddleware,
  generateText,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const reproducedSignal =
  'ISSUE_7830_REPRODUCED: Amazon Nova rejected the replayed assistant turn because AI SDK sent empty or blank content.';

function hasEmptyOrWhitespaceAssistantContent(requestBody: string): boolean {
  const body = JSON.parse(requestBody) as {
    messages?: Array<{
      role?: string;
      content?: Array<{ text?: string }>;
    }>;
  };

  return (
    body.messages?.some(
      message =>
        message.role === 'assistant' &&
        (message.content == null ||
          message.content.length === 0 ||
          message.content.some(
            part => typeof part.text === 'string' && part.text.trim() === '',
          )),
    ) === true
  );
}

async function createReasoningOnlyAssistantMessage({
  trailingText,
}: {
  trailingText: string;
}): Promise<UIMessage> {
  const usage: LanguageModelV4Usage = {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: 1,
      text: 1,
      reasoning: 0,
    },
  };

  const extracted = streamText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV4({
        async doStream() {
          const chunks: LanguageModelV4StreamPart[] = [
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: `<thinking>Only reasoning was generated.</thinking>${trailingText}`,
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ];

          return {
            stream: new ReadableStream({
              start(controller) {
                for (const chunk of chunks) {
                  controller.enqueue(chunk);
                }
                controller.close();
              },
            }),
          };
        },
      }),
      middleware: extractReasoningMiddleware({ tagName: 'thinking' }),
    }),
    prompt: 'Generate a response.',
  });

  let assistantMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: toUIMessageStream({ stream: extracted.stream }),
  })) {
    assistantMessage = message;
  }

  if (assistantMessage == null) {
    throw new Error(
      'Issue #7830 setup mismatch: streaming did not produce an assistant UI message.',
    );
  }

  if (!assistantMessage.parts.some(part => part.type === 'reasoning')) {
    throw new Error(
      'Issue #7830 setup mismatch: extractReasoningMiddleware did not produce a reasoning part.',
    );
  }

  return assistantMessage;
}

async function runScenario({
  name,
  trailingText,
}: {
  name: string;
  trailingText: string;
}) {
  const assistantMessage = await createReasoningOnlyAssistantMessage({
    trailingText,
  });
  const hasBlankTextPart = assistantMessage.parts.some(
    part => part.type === 'text' && part.text.trim() === '',
  );

  console.log(
    `${name}: middleware emitted blank text part: ${String(hasBlankTextPart)}`,
  );

  const messages = await convertToModelMessages([
    {
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'How many housing units were recorded in Atlanta?',
        },
      ],
    },
    assistantMessage,
    {
      role: 'user',
      parts: [{ type: 'text', text: 'How about Virginia Beach?' }],
    },
  ]);
  console.log(`${name}: model messages: ${JSON.stringify(messages)}`);

  let requestBody = '';
  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      requestBody = String(init?.body);
      return fetch(input, init);
    },
  });

  try {
    await generateText({
      model: bedrock('us.amazon.nova-pro-v1:0'),
      messages,
      maxOutputTokens: 16,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isReportedNovaValidationError =
      errorMessage.includes(
        'The content field in the Message object at messages.1 is empty.',
      ) ||
      errorMessage.includes(
        'The text field in the ContentBlock object at messages.1.content.0 is blank.',
      );

    if (
      isReportedNovaValidationError &&
      hasEmptyOrWhitespaceAssistantContent(requestBody)
    ) {
      throw new Error(reproducedSignal, { cause: error });
    }

    throw error;
  }

  console.log(`${name}: Bedrock request: ${requestBody}`);
  if (hasEmptyOrWhitespaceAssistantContent(requestBody)) {
    console.log(
      `${name}: Amazon Nova accepted the replay despite empty or whitespace-only assistant content.`,
    );
    return;
  }

  console.log(
    `${name}: AI SDK omitted empty or whitespace-only assistant content and Amazon Nova completed the follow-up turn.`,
  );
}

async function main() {
  await runScenario({ name: 'empty text', trailingText: '' });
  await runScenario({ name: 'newline text', trailingText: '\n' });
  console.log(
    'ISSUE_7830_NOT_REPRODUCED: Amazon Nova completed both reported follow-up scenarios.',
  );
}

main();
