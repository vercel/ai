import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, stepCountIs, streamText, tool, type Schema } from 'ai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const ISSUE_SIGNAL =
  'ISSUE #19488 REPRODUCED: recursive Google tool schema aborted generateText, streamText, and lazy activation before request';

const jsonFixtureUrl = new URL(
  '../../../../packages/google/src/__fixtures__/google-recursive-tool-call.json',
  import.meta.url,
);
const streamFixtureUrl = new URL(
  '../../../../packages/google/src/__fixtures__/google-recursive-tool-call.chunks.txt',
  import.meta.url,
);

const Condition: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ term: z.string() }),
    z.object({ and: z.array(Condition) }),
    z.object({ or: z.array(Condition) }),
  ]),
);

function asInputSchema(schema: z.ZodType): Schema<unknown> {
  return schema as unknown as Schema<unknown>;
}

const recursiveSearchTool = tool({
  description: 'Search with a condition tree.',
  inputSchema: asInputSchema(z.object({ condition: Condition })),
  execute: async () => 'ok',
});

const safeTool = tool({
  description: 'A non-recursive tool that should remain available.',
  inputSchema: asInputSchema(z.object({ value: z.string() })),
  execute: async () => 'ok',
});

const fetchCalls = {
  generateText: 0,
  streamText: 0,
  lazyActivation: 0,
};

function isReportedFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'AI_UnsupportedFunctionalityError' &&
    error.message.includes(
      'Google schema conversion does not support recursive JSON Schema references.',
    )
  );
}

async function checkGenerateText(jsonFixture: string) {
  const google = createGoogleGenerativeAI({
    apiKey: 'dummy-never-sent',
    fetch: async () => {
      fetchCalls.generateText++;
      return new Response(jsonFixture, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: google('gemini-3.7-flash'),
    prompt: "Search for videos matching 'x' or 'y'.",
    tools: { safe: safeTool, search: recursiveSearchTool },
    maxRetries: 0,
  });

  if (
    fetchCalls.generateText !== 1 ||
    result.toolCalls[0]?.toolName !== 'search'
  ) {
    throw new Error(
      'generateText did not complete the recursive-tool request successfully.',
    );
  }
}

async function checkStreamText(streamFixture: string) {
  const streamErrors: unknown[] = [];
  const google = createGoogleGenerativeAI({
    apiKey: 'dummy-never-sent',
    fetch: async () => {
      fetchCalls.streamText++;
      return new Response(streamFixture, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  const result = streamText({
    model: google('gemini-3.7-flash'),
    prompt: "Search for videos matching 'x' or 'y'.",
    tools: { safe: safeTool, search: recursiveSearchTool },
    maxRetries: 0,
    onError: ({ error }) => {
      streamErrors.push(error);
    },
  });

  let sawToolCall = false;
  for await (const part of result.fullStream) {
    if (part.type === 'tool-call' && part.toolName === 'search') {
      sawToolCall = true;
    }
  }

  if (streamErrors.length > 0) {
    throw streamErrors[0];
  }

  if (fetchCalls.streamText !== 1 || !sawToolCall) {
    throw new Error(
      'streamText did not complete the recursive-tool request successfully.',
    );
  }
}

async function checkLazyActivation() {
  const firstStepResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                name: 'discover',
                args: {},
                id: 'call_discover',
              },
            },
          ],
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 1,
      candidatesTokenCount: 1,
      totalTokenCount: 2,
    },
    modelVersion: 'gemini-3.7-flash',
  };
  const secondStepResponse = {
    candidates: [
      {
        content: {
          parts: [{ text: 'done' }],
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 1,
      candidatesTokenCount: 1,
      totalTokenCount: 2,
    },
    modelVersion: 'gemini-3.7-flash',
  };
  const google = createGoogleGenerativeAI({
    apiKey: 'dummy-never-sent',
    fetch: async () => {
      fetchCalls.lazyActivation++;
      return new Response(
        JSON.stringify(
          fetchCalls.lazyActivation === 1
            ? firstStepResponse
            : secondStepResponse,
        ),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await generateText({
    model: google('gemini-3.7-flash'),
    prompt: 'Discover tools, then continue.',
    tools: {
      discover: tool({
        inputSchema: asInputSchema(z.object({})),
        execute: async () => 'search is now available',
      }),
      search: recursiveSearchTool,
    },
    stopWhen: stepCountIs(2),
    maxRetries: 0,
    prepareStep: ({ stepNumber }) => ({
      activeTools: stepNumber === 0 ? ['discover'] : ['search'],
    }),
  });

  if (fetchCalls.lazyActivation !== 2 || result.text !== 'done') {
    throw new Error(
      'The multi-step call did not continue after activating the recursive tool.',
    );
  }
}

async function main() {
  const [jsonFixture, streamFixture] = await Promise.all([
    readFile(jsonFixtureUrl, 'utf8'),
    readFile(streamFixtureUrl, 'utf8'),
  ]);

  const failures = await Promise.all([
    checkGenerateText(jsonFixture).then(
      () => undefined,
      error => error,
    ),
    checkStreamText(streamFixture).then(
      () => undefined,
      error => error,
    ),
    checkLazyActivation().then(
      () => undefined,
      error => error,
    ),
  ]);

  if (
    failures.every(isReportedFailure) &&
    fetchCalls.generateText === 0 &&
    fetchCalls.streamText === 0 &&
    fetchCalls.lazyActivation === 1
  ) {
    console.error(ISSUE_SIGNAL);
    process.exitCode = 1;
    return;
  }

  const unexpectedFailure = failures.find(
    error => error != null && !isReportedFailure(error),
  );
  if (unexpectedFailure != null) {
    throw unexpectedFailure;
  }

  if (failures.some(error => error != null)) {
    throw new Error(
      'Only part of the reported generateText/streamText/lazy-activation failure occurred.',
    );
  }

  console.log(
    'Recursive Google tool schemas completed in generateText, streamText, and lazy activation.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
