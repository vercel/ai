import {
  InvalidToolInputError,
  NoSuchToolError,
  jsonSchema,
  streamText,
  tool,
} from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

async function runScenario({
  name,
  toolName,
  input,
  isExpectedError,
}: {
  name: string;
  toolName: string;
  input: string;
  isExpectedError: (error: unknown) => boolean;
}) {
  const expectedErrorText = `${name} error`;
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName,
              input,
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
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
          ],
        }),
      }),
    }),
    prompt: 'save a note',
    tools: {
      saveNote: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        }),
        execute: async () => 'saved',
      }),
    },
  });

  const onErrorArguments: unknown[] = [];
  const toolErrorChunks: Array<{
    type: 'tool-input-error' | 'tool-output-error';
    errorText: string;
  }> = [];

  for await (const chunk of result.toUIMessageStream({
    onError: error => {
      onErrorArguments.push(error);
      return isExpectedError(error)
        ? expectedErrorText
        : `unexpected ${typeof error}`;
    },
  })) {
    if (
      chunk.type === 'tool-input-error' ||
      chunk.type === 'tool-output-error'
    ) {
      toolErrorChunks.push(chunk);
    }
  }

  const hasExpectedChunks =
    toolErrorChunks.length === 2 &&
    toolErrorChunks[0]?.type === 'tool-input-error' &&
    toolErrorChunks[1]?.type === 'tool-output-error';

  if (!hasExpectedChunks) {
    throw new Error(
      `Reproduction setup failed: expected tool-input-error and tool-output-error chunks, received ${JSON.stringify(
        toolErrorChunks,
      )}`,
    );
  }

  const hasExpectedCallback =
    onErrorArguments.length === 1 && isExpectedError(onErrorArguments[0]);
  const chunksReuseOriginalErrorText = toolErrorChunks.every(
    chunk => chunk.errorText === expectedErrorText,
  );

  return {
    name,
    onErrorArguments,
    toolErrorChunks,
    expectedErrorText,
    passed: hasExpectedCallback && chunksReuseOriginalErrorText,
  };
}

async function main() {
  const results = await Promise.all([
    runScenario({
      name: 'invalid-input',
      toolName: 'saveNote',
      input: '{"text":"hel',
      isExpectedError: InvalidToolInputError.isInstance,
    }),
    runScenario({
      name: 'missing-tool',
      toolName: 'missingTool',
      input: '{"text":"hello"}',
      isExpectedError: NoSuchToolError.isInstance,
    }),
  ]);

  const failures = results
    .filter(result => !result.passed)
    .map(result => {
      const argumentTypes = result.onErrorArguments.map(error =>
        typeof error === 'string'
          ? 'string'
          : (error as { constructor?: { name?: string } })?.constructor?.name,
      );

      return `${result.name} invoked onError ${result.onErrorArguments.length} times (${argumentTypes.join(
        ', ',
      )}) and emitted error texts ${JSON.stringify(
        result.toolErrorChunks.map(chunk => chunk.errorText),
      )}; expected one original error callback and "${result.expectedErrorText}" on both chunks`;
    });

  if (failures.length > 0) {
    throw new Error(`ISSUE #22913 REPRODUCED: ${failures.join('; ')}`);
  }

  console.log(
    'Issue #22913 is not reproduced: each invalid tool call invoked onError once with the original error and both chunks reused its text.',
  );
}

await main();
