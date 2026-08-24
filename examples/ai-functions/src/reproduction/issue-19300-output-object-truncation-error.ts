import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const schema = z.object({
  city: z.string(),
  landmarks: z.array(z.object({ name: z.string() })),
});

const truncatedJson = '{"city": "Cairo", "landmarks": [{"name": "Great';

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 30,
    text: 30,
    reasoning: undefined,
  },
};

type ErrorDetails = {
  name: string | undefined;
  isNoObjectGeneratedError: boolean;
  isNoOutputGeneratedError: boolean;
  causeName: string | undefined;
  text: unknown;
  finishReason: unknown;
  usage: unknown;
};

function getProperty(value: unknown, property: string): unknown {
  return typeof value === 'object' && value != null
    ? Reflect.get(value, property)
    : undefined;
}

function describeError(error: unknown): ErrorDetails {
  const cause = getProperty(error, 'cause');

  return {
    name:
      error instanceof Error
        ? error.name
        : typeof getProperty(error, 'name') === 'string'
          ? (getProperty(error, 'name') as string)
          : undefined,
    isNoObjectGeneratedError: NoObjectGeneratedError.isInstance(error),
    isNoOutputGeneratedError: NoOutputGeneratedError.isInstance(error),
    causeName:
      cause instanceof Error
        ? cause.name
        : typeof getProperty(cause, 'name') === 'string'
          ? (getProperty(cause, 'name') as string)
          : undefined,
    text: getProperty(error, 'text'),
    finishReason: getProperty(error, 'finishReason'),
    usage: getProperty(error, 'usage'),
  };
}

async function captureGenerateError(): Promise<unknown> {
  try {
    const result = await generateText({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [{ type: 'text', text: truncatedJson }],
          finishReason: { unified: 'length', raw: 'length' },
          usage,
          warnings: [],
        },
      }),
      output: Output.object({ schema }),
      prompt: 'irrelevant',
    });

    result.output;
  } catch (error) {
    return error;
  }

  throw new Error(
    'Expected generateText structured output to fail for truncated JSON.',
  );
}

async function captureStreamError(): Promise<unknown> {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: truncatedJson },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'length', raw: 'length' },
            usage,
          },
        ]),
      },
    }),
    output: Output.object({ schema }),
    prompt: 'irrelevant',
  });

  for await (const _ of result.partialOutputStream) {
    // Drain the stream before reading the terminal output.
  }

  try {
    await result.output;
  } catch (error) {
    return error;
  }

  throw new Error(
    'Expected streamText structured output to fail for truncated JSON.',
  );
}

async function main() {
  const generateError = await captureGenerateError();
  const streamError = await captureStreamError();
  const generate = describeError(generateError);
  const stream = describeError(streamError);

  console.log(
    JSON.stringify({ generateText: generate, streamText: stream }, null, 2),
  );

  const generateUsage = generate.usage as { outputTokens?: number } | undefined;
  const streamUsage = stream.usage as { outputTokens?: number } | undefined;

  const failures = [
    generate.name !== stream.name &&
      `error classes differ (${generate.name} vs ${stream.name})`,
    generate.causeName !== 'AI_JSONParseError' &&
      `generateText cause is ${String(generate.causeName)}`,
    generate.text !== truncatedJson &&
      `generateText text is ${JSON.stringify(generate.text)}`,
    generate.finishReason !== 'length' &&
      `generateText finishReason is ${String(generate.finishReason)}`,
    generateUsage?.outputTokens !== 30 &&
      `generateText usage.outputTokens is ${String(generateUsage?.outputTokens)}`,
    stream.causeName !== 'AI_JSONParseError' &&
      `streamText cause is ${String(stream.causeName)}`,
    stream.text !== truncatedJson &&
      `streamText text is ${JSON.stringify(stream.text)}`,
    stream.finishReason !== 'length' &&
      `streamText finishReason is ${String(stream.finishReason)}`,
    streamUsage?.outputTokens !== 30 &&
      `streamText usage.outputTokens is ${String(streamUsage?.outputTokens)}`,
  ].filter((failure): failure is string => typeof failure === 'string');

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_19300_REPRODUCED: identical truncated Output.object() failures are inconsistent or generateText diagnostics are missing. ${failures.join('; ')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
