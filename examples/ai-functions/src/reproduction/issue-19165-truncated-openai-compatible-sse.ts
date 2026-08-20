import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const contentChunks = [
  `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n`,
  `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":null}]}\n\n`,
];

function finishChunk(finishReason: string): string {
  return `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1702657020,"model":"grok-3","choices":[{"index":0,"delta":{},"finish_reason":"${finishReason}"}]}\n\n`;
}

type ScenarioResult = {
  scenario: string;
  text: string;
  errorCount: number;
  finishReason: { unified: string; raw: string | undefined } | undefined;
};

function createSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

async function collectStream(
  stream: ReadableStream<LanguageModelV4StreamPart>,
): Promise<LanguageModelV4StreamPart[]> {
  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return parts;
    }
    parts.push(value);
  }
}

async function runScenario({
  scenario,
  chunks,
}: {
  scenario: string;
  chunks: string[];
}): Promise<ScenarioResult> {
  const provider = createOpenAICompatible({
    baseURL: 'https://example.invalid/v1',
    name: 'issue-19165',
    fetch: async () => createSseResponse(chunks),
  });

  const { stream } = await provider('grok-3').doStream({
    prompt,
    includeRawChunks: false,
  });
  const parts = await collectStream(stream);
  const finish = parts.find(part => part.type === 'finish');

  return {
    scenario,
    text: parts
      .filter(part => part.type === 'text-delta')
      .map(part => part.delta)
      .join(''),
    errorCount: parts.filter(part => part.type === 'error').length,
    finishReason: finish?.finishReason,
  };
}

function hasExpectedTruncationError(result: ScenarioResult): boolean {
  return (
    result.text === 'Hello World' &&
    result.errorCount > 0 &&
    result.finishReason?.unified === 'error' &&
    result.finishReason.raw === undefined
  );
}

async function main() {
  const truncatedResults = await Promise.all([
    runScenario({
      scenario: 'connection closes without [DONE]',
      chunks: contentChunks,
    }),
    runScenario({
      scenario: '[DONE] arrives without a non-null finish_reason',
      chunks: [...contentChunks, 'data: [DONE]\n\n'],
    }),
  ]);
  const controlResults = await Promise.all([
    runScenario({
      scenario: 'recognized stop finish_reason',
      chunks: [...contentChunks, finishChunk('stop'), 'data: [DONE]\n\n'],
    }),
    runScenario({
      scenario: 'unrecognized but present finish_reason',
      chunks: [
        ...contentChunks,
        finishChunk('vendor_stop'),
        'data: [DONE]\n\n',
      ],
    }),
  ]);

  console.log(JSON.stringify({ truncatedResults, controlResults }, null, 2));

  const [stopControl, otherControl] = controlResults;
  if (
    stopControl.text !== 'Hello World' ||
    stopControl.errorCount !== 0 ||
    stopControl.finishReason?.unified !== 'stop' ||
    stopControl.finishReason.raw !== 'stop' ||
    otherControl.text !== 'Hello World' ||
    otherControl.errorCount !== 0 ||
    otherControl.finishReason?.unified !== 'other' ||
    otherControl.finishReason.raw !== 'vendor_stop'
  ) {
    throw new Error(
      'Control failed: completed OpenAI-compatible streams were not mapped to their documented finish reasons.',
    );
  }

  const failures = truncatedResults.filter(
    result => !hasExpectedTruncationError(result),
  );
  if (failures.length > 0) {
    throw new Error(
      "Reproduced issue #19165: truncated OpenAI-compatible SSE was reported as a successful 'other' finish without an error event.",
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
