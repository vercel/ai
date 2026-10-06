import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { createVertex } from '@ai-sdk/google-vertex';
import assert from 'node:assert/strict';
import {
  generateText,
  simulateReadableStream,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 1, reasoning: 1 },
};

function includesThoughts(params: LanguageModelV4CallOptions) {
  const googleOptions = params.providerOptions?.google as
    | { thinkingConfig?: { includeThoughts?: boolean } }
    | undefined;
  return googleOptions?.thinkingConfig?.includeThoughts === true;
}

function withThinkingMiddleware<
  T extends Parameters<typeof wrapLanguageModel>[0]['model'],
>(model: T) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) => {
        (params.providerOptions ??= {}).google = {
          thinkingConfig: { includeThoughts: true },
        };
        return params;
      },
    },
  });
}

async function checkCorePath() {
  const providerOptionsReached = {
    generateText: false,
    streamText: false,
  };

  const model = withThinkingMiddleware(
    new MockLanguageModelV4({
      doGenerate: async params => {
        providerOptionsReached.generateText = includesThoughts(params);
        return {
          content: providerOptionsReached.generateText
            ? [{ type: 'reasoning', text: 'generated thought' }]
            : [],
          finishReason: { unified: 'stop', raw: 'STOP' },
          usage,
          warnings: [],
        };
      },
      doStream: async params => {
        providerOptionsReached.streamText = includesThoughts(params);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              ...(providerOptionsReached.streamText
                ? [
                    { type: 'reasoning-start' as const, id: 'reasoning-1' },
                    {
                      type: 'reasoning-delta' as const,
                      id: 'reasoning-1',
                      delta: 'streamed thought',
                    },
                    { type: 'reasoning-end' as const, id: 'reasoning-1' },
                  ]
                : []),
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'STOP' },
                usage,
              },
            ],
          }),
        };
      },
    }),
  );

  const generated = await generateText({ model, prompt: 'hi' });
  const streamed = streamText({ model, prompt: 'hi' });
  for await (const _ of streamed.fullStream) {
    // Consume the stream so the terminal reasoning result is available.
  }
  const streamedReasoning = await streamed.reasoning;

  const result = {
    providerOptionsReached,
    reasoning: {
      generateText: generated.reasoning.length > 0,
      streamText: streamedReasoning.length > 0,
    },
  };

  console.log('core:', JSON.stringify(result));

  assert.equal(
    result.providerOptionsReached.generateText,
    true,
    'generateText did not receive middleware-transformed provider options',
  );
  assert.equal(
    result.reasoning.generateText,
    true,
    'generateText did not expose reasoning enabled by transformed options',
  );
  assert.equal(
    result.providerOptionsReached.streamText,
    true,
    'streamText did not receive middleware-transformed provider options',
  );
  assert.equal(
    result.reasoning.streamText,
    true,
    'streamText did not expose reasoning enabled by transformed options',
  );
}

async function checkVertexRequestPath() {
  let streamedRequestUrl: string | undefined;
  let streamedRequestBody: unknown;

  const vertex = createVertex({
    apiKey: 'test-key',
    fetch: async (input, init) => {
      streamedRequestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      streamedRequestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;

      return new Response(
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'provider thought', thought: true },
                  { text: 'provider answer' },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            thoughtsTokenCount: 1,
            totalTokenCount: 3,
          },
        })}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });

  const result = streamText({
    model: withThinkingMiddleware(vertex('gemini-3-flash-preview')),
    prompt: 'hi',
  });
  for await (const _ of result.fullStream) {
    // Consume the provider stream.
  }
  const reasoning = await result.reasoning;

  const thinkingConfig = (
    streamedRequestBody as {
      generationConfig?: {
        thinkingConfig?: { includeThoughts?: boolean };
      };
    }
  )?.generationConfig?.thinkingConfig;

  const observed = {
    requestIsStreaming: streamedRequestUrl?.includes(
      ':streamGenerateContent?alt=sse',
    ),
    includeThoughts: thinkingConfig?.includeThoughts === true,
    reasoning: reasoning.length > 0,
  };

  console.log('vertex:', JSON.stringify(observed));

  assert.equal(
    observed.requestIsStreaming,
    true,
    'Vertex request did not use streamGenerateContent',
  );
  assert.equal(
    observed.includeThoughts,
    true,
    'Vertex streamed request omitted middleware-added includeThoughts',
  );
  assert.equal(
    observed.reasoning,
    true,
    'streamText did not expose a Vertex thought part as reasoning',
  );
}

async function main() {
  await checkCorePath();
  await checkVertexRequestPath();
  console.log('issue-15704: current main does not reproduce the reported bug');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
