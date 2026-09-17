import assert from 'node:assert/strict';
import {
  generateText,
  type ModelMessage,
  simulateStreamingMiddleware,
  streamText,
  ToolLoopAgent,
  wrapLanguageModel,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';

const providerMetadata = {
  example: { reference: 'synthetic-reference' },
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function createGenerateModel() {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [
        {
          type: 'text',
          text: 'Synthetic response.',
          providerMetadata,
        },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
  });
}

function getResponseTextProviderOptions(messages: ModelMessage[]) {
  const assistantMessage = messages.find(
    message => message.role === 'assistant',
  );

  if (
    assistantMessage == null ||
    typeof assistantMessage.content === 'string'
  ) {
    return undefined;
  }

  const textPart = assistantMessage.content.find(part => part.type === 'text');
  return textPart?.providerOptions;
}

async function getContinuationTextProviderOptions(messages: ModelMessage[]) {
  const continuationModel = createGenerateModel();

  await generateText({
    model: continuationModel,
    messages: [
      { role: 'user', content: 'Test.' },
      ...messages,
      { role: 'user', content: 'Continue.' },
    ],
    maxRetries: 0,
  });

  const assistantMessage = continuationModel.doGenerateCalls[0].prompt.find(
    message => message.role === 'assistant',
  );

  if (
    assistantMessage == null ||
    typeof assistantMessage.content === 'string'
  ) {
    return undefined;
  }

  const textPart = assistantMessage.content.find(part => part.type === 'text');
  return textPart?.providerOptions;
}

async function main() {
  const generated = await generateText({
    model: createGenerateModel(),
    prompt: 'Test.',
    maxRetries: 0,
  });

  assert.deepEqual(generated.content[0], {
    type: 'text',
    text: 'Synthetic response.',
    providerMetadata,
  });
  assert.deepEqual(generated.response.messages[0].content[0], {
    type: 'text',
    text: 'Synthetic response.',
    providerOptions: providerMetadata,
  });
  assert.deepEqual(
    await getContinuationTextProviderOptions(generated.response.messages),
    providerMetadata,
  );

  const nativeStreamed = streamText({
    model: new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream<LanguageModelV3StreamPart>([
          { type: 'stream-start', warnings: [] },
          {
            type: 'text-start',
            id: 'text-0',
            providerMetadata,
          },
          {
            type: 'text-delta',
            id: 'text-0',
            delta: 'Synthetic response.',
          },
          { type: 'text-end', id: 'text-0' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      },
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });
  assert.deepEqual((await nativeStreamed.content)[0], {
    type: 'text',
    text: 'Synthetic response.',
    providerMetadata,
  });

  const simulatedReasoning = streamText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [
            {
              type: 'reasoning',
              text: 'Synthetic reasoning.',
              providerMetadata,
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        },
      }),
      middleware: simulateStreamingMiddleware(),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });
  assert.deepEqual((await simulatedReasoning.content)[0], {
    type: 'reasoning',
    text: 'Synthetic reasoning.',
    providerMetadata,
  });

  const streamed = streamText({
    model: wrapLanguageModel({
      model: createGenerateModel(),
      middleware: simulateStreamingMiddleware(),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });

  const streamedContent = await streamed.content;
  const streamedResponse = await streamed.response;

  assert.equal(streamedContent[0]?.type, 'text');
  assert.equal(streamedContent[0].text, 'Synthetic response.');

  const contentMetadata =
    streamedContent[0].type === 'text'
      ? streamedContent[0].providerMetadata
      : undefined;
  const historyMetadata = getResponseTextProviderOptions(
    streamedResponse.messages,
  );
  const continuationMetadata = await getContinuationTextProviderOptions(
    streamedResponse.messages,
  );

  const agent = new ToolLoopAgent({
    model: wrapLanguageModel({
      model: createGenerateModel(),
      middleware: simulateStreamingMiddleware(),
    }),
  });
  const agentResult = await agent.stream({ prompt: 'Test.' });
  const agentContent = await agentResult.content;
  const agentMetadata =
    agentContent[0].type === 'text'
      ? agentContent[0].providerMetadata
      : undefined;

  if (
    JSON.stringify(contentMetadata) !== JSON.stringify(providerMetadata) ||
    JSON.stringify(historyMetadata) !== JSON.stringify(providerMetadata) ||
    JSON.stringify(continuationMetadata) !== JSON.stringify(providerMetadata) ||
    JSON.stringify(agentMetadata) !== JSON.stringify(providerMetadata)
  ) {
    throw new Error(
      `BUG: simulated text provider metadata was dropped; content=${JSON.stringify(
        contentMetadata,
      )}, history=${JSON.stringify(
        historyMetadata,
      )}, continuation=${JSON.stringify(
        continuationMetadata,
      )}, agent=${JSON.stringify(agentMetadata)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
