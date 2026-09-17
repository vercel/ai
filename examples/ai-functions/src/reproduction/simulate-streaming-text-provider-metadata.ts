import assert from 'node:assert/strict';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import {
  generateText,
  simulateStreamingMiddleware,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const providerMetadata = {
  example: { reference: 'synthetic-reference' },
};

const response = {
  content: [
    {
      type: 'text' as const,
      text: 'Synthetic response.',
      providerMetadata,
    },
  ],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
};

function createStream(parts: LanguageModelV4StreamPart[]) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

function getProviderOptionsFromFirstMessage(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return undefined;
  }

  const content = (messages[0] as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const part = content[0];
  return typeof part === 'object' && part != null && 'providerOptions' in part
    ? part.providerOptions
    : undefined;
}

async function main() {
  const model = new MockLanguageModelV4({ doGenerate: response });

  const generated = await generateText({
    model,
    prompt: 'Test.',
    maxRetries: 0,
  });

  const streamed = streamText({
    model: wrapLanguageModel({
      model,
      middleware: simulateStreamingMiddleware(),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });

  const streamedContent = await streamed.content;
  const streamedMessages = (await streamed.response).messages;

  // Controls: ordinary generation preserves the text metadata and maps it to
  // providerOptions in reusable response history.
  if (generated.content[0]?.type !== 'text') {
    throw new Error('Control failed: generateText did not return a text part');
  }
  assert.deepStrictEqual(
    generated.content[0]?.providerMetadata,
    providerMetadata,
  );
  assert.deepStrictEqual(
    getProviderOptionsFromFirstMessage(generated.response.messages),
    providerMetadata,
  );

  // Controls: native text streaming and simulated reasoning retain equivalent
  // per-part metadata.
  const nativeResult = streamText({
    model: new MockLanguageModelV4({
      doStream: {
        stream: createStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1', providerMetadata },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: 'Synthetic response.',
          },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: response.finishReason,
            usage: response.usage,
          },
        ]),
      },
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });
  const nativeContent = await nativeResult.content;
  const nativeMessages = (await nativeResult.response).messages;
  if (nativeContent[0]?.type !== 'text') {
    throw new Error('Control failed: native streaming did not return text');
  }
  assert.deepStrictEqual(nativeContent[0]?.providerMetadata, providerMetadata);
  assert.deepStrictEqual(
    getProviderOptionsFromFirstMessage(nativeMessages),
    providerMetadata,
  );

  const reasoningResult = streamText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: {
          ...response,
          content: [
            {
              type: 'reasoning',
              text: 'Synthetic reasoning.',
              providerMetadata,
            },
          ],
        },
      }),
      middleware: simulateStreamingMiddleware(),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });
  const reasoningContent = await reasoningResult.content;
  const reasoningMessages = (await reasoningResult.response).messages;
  if (reasoningContent[0]?.type !== 'reasoning') {
    throw new Error(
      'Control failed: simulated reasoning did not return reasoning',
    );
  }
  assert.deepStrictEqual(
    reasoningContent[0]?.providerMetadata,
    providerMetadata,
  );
  assert.deepStrictEqual(
    getProviderOptionsFromFirstMessage(reasoningMessages),
    providerMetadata,
  );

  // The text itself survives simulated streaming.
  if (streamedContent[0]?.type !== 'text') {
    throw new Error('Control failed: simulated streaming did not return text');
  }
  assert.equal(streamedContent[0]?.text, 'Synthetic response.');

  const contentMetadata = streamedContent[0]?.providerMetadata;
  const historyProviderOptions =
    getProviderOptionsFromFirstMessage(streamedMessages);

  const continuationModel = new MockLanguageModelV4({
    doGenerate: {
      ...response,
      content: [{ type: 'text', text: 'Continuation response.' }],
    },
  });
  await generateText({
    model: continuationModel,
    messages: [
      ...streamedMessages,
      { role: 'user', content: 'Continue the previous response.' },
    ],
    maxRetries: 0,
  });
  const replayedProviderOptions = getProviderOptionsFromFirstMessage(
    continuationModel.doGenerateCalls[0]?.prompt,
  );

  console.log(
    JSON.stringify({
      generatedContent: generated.content,
      streamedContent,
      generatedMessages: generated.response.messages,
      streamedMessages,
      continuationPrompt: continuationModel.doGenerateCalls[0]?.prompt,
    }),
  );

  if (
    contentMetadata === undefined &&
    historyProviderOptions === undefined &&
    replayedProviderOptions === undefined
  ) {
    throw new Error(
      'ISSUE #20970: simulated text metadata is missing from content, response history, and continuation prompt',
    );
  }

  assert.deepStrictEqual(contentMetadata, providerMetadata);
  assert.deepStrictEqual(historyProviderOptions, providerMetadata);
  assert.deepStrictEqual(replayedProviderOptions, providerMetadata);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
