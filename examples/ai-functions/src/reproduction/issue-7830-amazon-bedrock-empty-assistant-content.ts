import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type {
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  convertToModelMessages,
  extractReasoningMiddleware,
  generateText,
  readUIMessageStream,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV2 } from 'ai/test';

async function main() {
  const usage: LanguageModelV2Usage = {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
  };

  const extracted = streamText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV2({
        async doStream() {
          const chunks: LanguageModelV2StreamPart[] = [
            {
              type: 'response-metadata',
              id: 'response-1',
              modelId: 'mock-model',
              timestamp: new Date(0),
            },
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: '<thinking>Only reasoning was generated.</thinking>',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: 'stop',
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
    stream: extracted.toUIMessageStream({ sendReasoning: true }),
  })) {
    assistantMessage = message;
  }

  if (
    assistantMessage == null ||
    !assistantMessage.parts.some(part => part.type === 'reasoning')
  ) {
    throw new Error(
      'Issue #7830 setup mismatch: reasoning extraction did not produce an assistant reasoning part.',
    );
  }

  console.error(
    `Extracted assistant message: ${JSON.stringify(assistantMessage)}`,
  );

  const messages = convertToModelMessages([
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
    });
  } catch (error) {
    console.error(`Bedrock request: ${requestBody}`);
    throw error;
  }

  console.log(
    'Issue #7830 did not reproduce: the subsequent Amazon Nova turn completed.',
  );
}

main();
