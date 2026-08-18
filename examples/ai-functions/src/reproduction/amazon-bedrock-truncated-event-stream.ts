import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { crc32 } from 'node:zlib';

const textEncoder = new TextEncoder();

function encodeEvent(eventType: string, body: unknown): Uint8Array {
  const headers = concatenate([
    encodeStringHeader(':message-type', 'event'),
    encodeStringHeader(':event-type', eventType),
  ]);
  const payload = textEncoder.encode(JSON.stringify(body));
  const totalLength = 16 + headers.length + payload.length;
  const message = new Uint8Array(totalLength);
  const view = new DataView(message.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, headers.length, false);
  view.setUint32(8, crc32(message.subarray(0, 8)), false);
  message.set(headers, 12);
  message.set(payload, 12 + headers.length);
  view.setUint32(
    totalLength - 4,
    crc32(message.subarray(0, totalLength - 4)),
    false,
  );

  return message;
}

function encodeStringHeader(name: string, value: string): Uint8Array {
  const nameBytes = textEncoder.encode(name);
  const valueBytes = textEncoder.encode(value);
  const header = new Uint8Array(
    1 + nameBytes.length + 1 + 2 + valueBytes.length,
  );
  const view = new DataView(header.buffer);

  header[0] = nameBytes.length;
  header.set(nameBytes, 1);
  header[1 + nameBytes.length] = 7;
  view.setUint16(2 + nameBytes.length, valueBytes.length, false);
  header.set(valueBytes, 4 + nameBytes.length);

  return header;
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  );
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function createFragmentedBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const fragmentSizes = [1, 2, 7, 3, 11, 5];

  return new ReadableStream({
    start(controller) {
      let offset = 0;
      let fragmentIndex = 0;

      while (offset < bytes.length) {
        const size = fragmentSizes[fragmentIndex % fragmentSizes.length];
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
        fragmentIndex++;
      }

      controller.close();
    },
  });
}

function createModel(responseBytes: Uint8Array) {
  return createAmazonBedrock({
    apiKey: 'reproduction-api-key',
    region: 'us-east-1',
    fetch: async () =>
      new Response(createFragmentedBody(responseBytes), {
        status: 200,
        headers: {
          'content-type': 'application/vnd.amazon.eventstream',
        },
      }),
  })('anthropic.claude-3-haiku-20240307-v1:0');
}

async function consume(
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

async function streamResponse(responseBytes: Uint8Array) {
  const { stream } = await createModel(responseBytes).doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
    includeRawChunks: false,
  });

  return consume(stream);
}

async function verifyValidFragmentedFrames() {
  const validResponse = concatenate([
    encodeEvent('contentBlockDelta', {
      contentBlockIndex: 0,
      delta: { text: 'Hello' },
    }),
    encodeEvent('messageStop', { stopReason: 'end_turn' }),
    encodeEvent('metadata', {
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }),
  ]);

  const parts = await streamResponse(validResponse);
  const textDelta = parts.find(part => part.type === 'text-delta');
  const finish = parts.find(part => part.type === 'finish');

  if (
    textDelta?.type !== 'text-delta' ||
    textDelta.delta !== 'Hello' ||
    finish?.type !== 'finish' ||
    finish.finishReason.unified !== 'stop'
  ) {
    throw new Error(
      `Valid fragmented AWS event-stream frames did not decode correctly: ${JSON.stringify(parts)}`,
    );
  }
}

async function observeCleanFrameBoundaryWithoutMessageStop() {
  const completeTextFrame = encodeEvent('contentBlockDelta', {
    contentBlockIndex: 0,
    delta: { text: 'complete frame' },
  });

  try {
    const parts = await streamResponse(completeTextFrame);
    const finish = parts.find(part => part.type === 'finish');
    return `completed with finish=${JSON.stringify(finish)}`;
  } catch (error) {
    return `rejected with error=${error instanceof Error ? error.message : String(error)}`;
  }
}

async function main() {
  await verifyValidFragmentedFrames();
  const cleanBoundaryObservation =
    await observeCleanFrameBoundaryWithoutMessageStop();

  const textFrame = encodeEvent('contentBlockDelta', {
    contentBlockIndex: 0,
    delta: { text: 'partial result' },
  });
  const messageStopFrame = encodeEvent('messageStop', {
    stopReason: 'end_turn',
  });
  const truncatedResponse = concatenate([
    textFrame,
    messageStopFrame.slice(0, -1),
  ]);

  let parts: LanguageModelV4StreamPart[];

  try {
    parts = await streamResponse(truncatedResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const describesIncompleteFrame =
      /(incomplete|truncat)/i.test(message) &&
      /(event.?stream|frame|message)/i.test(message);

    if (!describesIncompleteFrame) {
      throw new Error(
        `The truncated stream rejected with an unrelated error: ${message}`,
        { cause: error },
      );
    }

    console.log(
      `Truncated event-stream frame rejected as expected: ${message}`,
    );
    return;
  }

  const finish = parts.find(part => part.type === 'finish');
  throw new Error(
    `ISSUE_19035_REPRODUCED: truncated Bedrock event-stream frame completed normally instead of rejecting; finish=${JSON.stringify(finish)}; clean-boundary-without-messageStop=${cleanBoundaryObservation}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
