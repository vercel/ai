import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  APICallError,
  convertToModelMessages,
  extractReasoningMiddleware,
  generateText,
  readUIMessageStream,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

const expectedBedrockError =
  'The content field in the Message object at messages.1 is empty. Add a ContentBlock object to the content field and try again.';

async function extractReasoningOnlyAssistantMessage(): Promise<UIMessage> {
  const model = wrapLanguageModel({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 'text-1' },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: '<thinking>Reasoning-only response</thinking>',
          },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { raw: undefined, unified: 'stop' },
            usage: {
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
            },
          },
        ]),
      }),
    }),
    middleware: extractReasoningMiddleware({ tagName: 'thinking' }),
  });

  const result = streamText({
    model,
    prompt: 'Produce a reasoning-only response.',
  });

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: result.toUIMessageStream({ sendReasoning: true }),
  })) {
    finalMessage = message;
  }

  if (finalMessage == null) {
    throw new Error('The middleware stream did not produce a UI message.');
  }

  return finalMessage;
}

async function main() {
  const assistantMessage = await extractReasoningOnlyAssistantMessage();
  console.log(`MIDDLEWARE_UI_PARTS=${JSON.stringify(assistantMessage.parts)}`);

  const modelMessages = await convertToModelMessages([
    {
      role: 'user',
      parts: [{ type: 'text', text: 'First turn' }],
    },
    assistantMessage,
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Reply with exactly OK' }],
    },
  ]);

  let requestBody: unknown;
  const bedrock = createAmazonBedrock({
    fetch: async (url, init) => {
      requestBody = JSON.parse(String(init?.body));
      console.log(`BEDROCK_REQUEST=${JSON.stringify(requestBody)}`);
      return fetch(url, init);
    },
  });

  try {
    const result = await generateText({
      model: bedrock('us.amazon.nova-pro-v1:0'),
      messages: modelMessages,
      maxRetries: 0,
    });

    if (result.text.trim().length === 0) {
      throw new Error(
        'Amazon Nova completed the request without returning assistant text.',
      );
    }

    console.log(`FOLLOW_UP_COMPLETED=${JSON.stringify(result.text)}`);
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      error.message.includes(expectedBedrockError) &&
      hasEmptyAssistantContent(requestBody)
    ) {
      console.error(
        'ISSUE_7830_REPRODUCED: Amazon Nova rejected the follow-up because AI SDK sent an assistant message with empty content.',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

function hasEmptyAssistantContent(requestBody: unknown): boolean {
  if (
    requestBody == null ||
    typeof requestBody !== 'object' ||
    !('messages' in requestBody) ||
    !Array.isArray(requestBody.messages)
  ) {
    return false;
  }

  return requestBody.messages.some(
    message =>
      message != null &&
      typeof message === 'object' &&
      'role' in message &&
      message.role === 'assistant' &&
      'content' in message &&
      Array.isArray(message.content) &&
      message.content.length === 0,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
