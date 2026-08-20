import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

const textChunks = [
  `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n`,
  `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":null}]}\n\n`,
];

async function readStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
  const events: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return events;
    }
    events.push(value);
  }
}

async function runScenario({
  name,
  chunks,
}: {
  name: string;
  chunks: string[];
}) {
  const provider = createOpenAICompatible({
    baseURL: 'https://example.invalid/v1',
    name: 'test-provider',
    fetch: async () =>
      new Response(chunks.join(''), {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const { stream } = await provider('grok-3').doStream({
    prompt,
    includeRawChunks: false,
  });
  const events = await readStream(stream);

  return {
    name,
    text: events
      .filter(event => event.type === 'text-delta')
      .map(event => event.delta)
      .join(''),
    errors: events.filter(event => event.type === 'error'),
    finishes: events.filter(event => event.type === 'finish'),
  };
}

function assertControl(
  result: Awaited<ReturnType<typeof runScenario>>,
  expected: { unified: 'stop' | 'other'; raw: string },
) {
  if (
    result.text !== 'Hello World' ||
    result.errors.length !== 0 ||
    result.finishes.length !== 1 ||
    result.finishes[0].finishReason.unified !== expected.unified ||
    result.finishes[0].finishReason.raw !== expected.raw
  ) {
    throw new Error(
      `Control scenario ${result.name} did not produce the documented finish reason: ${JSON.stringify(result)}`,
    );
  }
}

async function main() {
  const abruptEof = await runScenario({
    name: 'EOF without [DONE]',
    chunks: textChunks,
  });
  const doneWithoutFinishReason = await runScenario({
    name: '[DONE] without a non-null finish_reason',
    chunks: [...textChunks, 'data: [DONE]\n\n'],
  });
  const stopControl = await runScenario({
    name: 'recognized stop finish_reason',
    chunks: [
      ...textChunks,
      `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
      'data: [DONE]\n\n',
    ],
  });
  const unknownControl = await runScenario({
    name: 'present unrecognized finish_reason',
    chunks: [
      ...textChunks,
      `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{},"finish_reason":"vendor_stop"}]}\n\n`,
      'data: [DONE]\n\n',
    ],
  });

  assertControl(stopControl, { unified: 'stop', raw: 'stop' });
  assertControl(unknownControl, {
    unified: 'other',
    raw: 'vendor_stop',
  });

  const truncatedResults = [abruptEof, doneWithoutFinishReason];
  const reproducedCases: string[] = [];

  for (const result of truncatedResults) {
    if (result.text !== 'Hello World' || result.finishes.length !== 1) {
      throw new Error(
        `Truncated scenario ${result.name} did not preserve text and emit one terminal finish: ${JSON.stringify(result)}`,
      );
    }

    const finishReason = result.finishes[0].finishReason;
    const isExpectedError =
      result.errors.length > 0 &&
      finishReason.unified === 'error' &&
      finishReason.raw === undefined;
    const isReportedBug =
      result.errors.length === 0 &&
      finishReason.unified === 'other' &&
      finishReason.raw === undefined;

    if (isReportedBug) {
      reproducedCases.push(result.name);
    } else if (!isExpectedError) {
      throw new Error(
        `Truncated scenario ${result.name} produced an unexpected terminal state: ${JSON.stringify(result)}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        abruptEof,
        doneWithoutFinishReason,
        stopControl,
        unknownControl,
      },
      null,
      2,
    ),
  );

  if (reproducedCases.length > 0) {
    throw new Error(
      `Reproduced issue #19165: truncated OpenAI-compatible SSE streams were reported as successful "other" finishes without error parts (${reproducedCases.join(', ')}).`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
