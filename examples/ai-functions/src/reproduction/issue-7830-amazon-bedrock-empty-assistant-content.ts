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

async function main() {
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
              delta: '<thinking>Only reasoning was generated.</thinking>',
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

  const reasoningPart = assistantMessage.parts.find(
    part => part.type === 'reasoning',
  );
  const whitespaceTextPart = assistantMessage.parts.find(
    part => part.type === 'text' && part.text.trim() === '',
  );

  if (reasoningPart == null || whitespaceTextPart == null) {
    throw new Error(
      'Issue #7830 setup mismatch: extractReasoningMiddleware did not produce a UI message with reasoning plus empty text.',
    );
  }

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

  let requestBody = '';
  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      requestBody = String(init?.body);
      return fetch(input, init);
    },
  });

  await generateText({
    model: bedrock('us.amazon.nova-pro-v1:0'),
    messages,
  });

  if (!requestBody.includes('"role":"assistant","content":[]')) {
    throw new Error(
      `Issue #7830 setup mismatch: expected empty assistant content in the Bedrock request, received ${requestBody}`,
    );
  }

  console.log(
    'Issue #7830 did not reproduce: Amazon Nova accepted an assistant message with empty content.',
  );
}

main();
