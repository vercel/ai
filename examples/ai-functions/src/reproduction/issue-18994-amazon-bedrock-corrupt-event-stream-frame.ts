import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';

interface LiveFixture {
  response: {
    contentType: string;
    bodyBase64: string;
  };
}

interface StreamObservation {
  errorPartCount: number;
  text: string;
  finishReason: string | undefined;
  thrownError: string | undefined;
}

interface EventStreamMessage {
  headers: Record<string, { type: 'string'; value: string }>;
  body: Uint8Array;
}

interface EventStreamCodecInstance {
  encode(message: EventStreamMessage): Uint8Array;
}

const fixturePath = fileURLToPath(
  new URL(
    '../../../../packages/amazon-bedrock/src/__fixtures__/issue-18994-live-converse-stream.json',
    import.meta.url,
  ),
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as LiveFixture;
const liveResponseBytes = Uint8Array.from(
  Buffer.from(fixture.response.bodyBase64, 'base64'),
);

const requireFromBedrock = createRequire(
  fileURLToPath(
    new URL(
      '../../../../packages/amazon-bedrock/package.json',
      import.meta.url,
    ),
  ),
);
const { EventStreamCodec } = requireFromBedrock(
  '@smithy/eventstream-codec',
) as {
  EventStreamCodec: new (
    toUtf8: (input: Uint8Array) => string,
    fromUtf8: (input: string) => Uint8Array,
  ) => EventStreamCodecInstance;
};
const { fromUtf8, toUtf8 } = requireFromBedrock('@smithy/util-utf8') as {
  fromUtf8: (input: string) => Uint8Array;
  toUtf8: (input: Uint8Array) => string;
};

function splitFrames(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const totalLength = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    ).getUint32(0, false);

    if (totalLength < 16 || offset + totalLength > bytes.length) {
      throw new Error('Live fixture contains an invalid event-stream frame');
    }

    frames.push(bytes.slice(offset, offset + totalLength));
    offset += totalLength;
  }

  return frames;
}

function mockResponse(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': fixture.response.contentType,
        'x-amzn-requestid': 'issue-18994-reproduction',
      },
    },
  );
}

async function observeProviderStream(
  chunks: Uint8Array[],
): Promise<StreamObservation> {
  const bedrock = createAmazonBedrock({
    apiKey: 'reproduction-only',
    baseURL: 'https://bedrock.example.invalid',
    region: 'eu-central-1',
    fetch: async () => mockResponse(chunks),
  });
  const result = streamText({
    model: bedrock('eu.anthropic.claude-sonnet-4-6'),
    prompt: 'Reply with exactly OK.',
  });

  let errorPartCount = 0;
  let text = '';
  let finishReason: string | undefined;
  let thrownError: string | undefined;

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        errorPartCount++;
      } else if (part.type === 'text-delta') {
        text += part.text;
      } else if (part.type === 'finish') {
        finishReason = part.finishReason;
      }
    }
  } catch (error) {
    thrownError = error instanceof Error ? error.message : String(error);
  }

  return {
    errorPartCount,
    text,
    finishReason,
    thrownError,
  };
}

function hasObservableError(observation: StreamObservation): boolean {
  return observation.errorPartCount > 0 || observation.thrownError != null;
}

async function main() {
  const frames = splitFrames(liveResponseBytes);

  const healthy = await observeProviderStream(frames);
  if (
    hasObservableError(healthy) ||
    healthy.text !== 'OK.' ||
    healthy.finishReason !== 'stop'
  ) {
    throw new Error(
      `Live fixture precondition failed: ${JSON.stringify(healthy)}`,
    );
  }

  const corruptedFrames = frames.map(frame => frame.slice());
  corruptedFrames[0][corruptedFrames[0].length - 1] ^= 0xff;
  const corrupted = await observeProviderStream(corruptedFrames);

  const codec = new EventStreamCodec(toUtf8, fromUtf8);
  const exceptionFrame = codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'exception' },
      ':exception-type': {
        type: 'string',
        value: 'modelStreamErrorException',
      },
      ':content-type': { type: 'string', value: 'application/json' },
    },
    body: fromUtf8(JSON.stringify({ message: 'model stream failed' })),
  });
  const modeledException = await observeProviderStream([exceptionFrame]);

  const trailingPartial = await observeProviderStream([frames[0].slice(0, -1)]);
  const missingTerminalEvent = await observeProviderStream([frames[0]]);

  console.log(
    JSON.stringify(
      {
        healthy,
        corruptedFrameFollowedByValidFrames: corrupted,
        modeledException,
        trailingPartialFrame: trailingPartial,
        eofWithoutTerminalEvent: missingTerminalEvent,
      },
      null,
      2,
    ),
  );

  if (!hasObservableError(corrupted)) {
    console.error(
      'ISSUE_18994_REPRODUCED: corrupted Bedrock event-stream frame completed without an observable error',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
