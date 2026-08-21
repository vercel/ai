import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

type StreamPart = {
  type: string;
  delta?: string;
  finishReason?: {
    unified?: string;
    raw?: string;
  };
  usage?: {
    inputTokens?: { total?: number };
    outputTokens?: { total?: number };
  };
};

type ScenarioResult = {
  parts: StreamPart[];
  error?: unknown;
};

const textEncoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
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
  view.setUint16(1 + nameBytes.length + 1, valueBytes.length, false);
  header.set(valueBytes, 1 + nameBytes.length + 1 + 2);

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

function encodeEvent(eventType: string, payload: unknown): Uint8Array {
  const headers = concatenate([
    encodeStringHeader(':message-type', 'event'),
    encodeStringHeader(':event-type', eventType),
  ]);
  const body = textEncoder.encode(JSON.stringify(payload));
  const totalLength = 16 + headers.length + body.length;
  const message = new Uint8Array(totalLength);
  const view = new DataView(message.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, headers.length, false);
  view.setUint32(8, crc32(message.subarray(0, 8)), false);
  message.set(headers, 12);
  message.set(body, 12 + headers.length);
  view.setUint32(totalLength - 4, crc32(message.subarray(0, -4)), false);

  return message;
}

function fragment(bytes: Uint8Array): Uint8Array[] {
  const chunkSizes = [1, 2, 3, 5, 8, 13, 21];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < bytes.length) {
    const end = Math.min(
      bytes.length,
      offset + chunkSizes[chunkIndex % chunkSizes.length],
    );
    chunks.push(bytes.slice(offset, end));
    offset = end;
    chunkIndex++;
  }

  return chunks;
}

function responseBody(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function runScenario(chunks: Uint8Array[]): Promise<ScenarioResult> {
  const provider = createAmazonBedrock({
    apiKey: 'reproduction-api-key',
    region: 'us-east-1',
    baseURL: 'https://bedrock.example.test',
    fetch: async () =>
      new Response(responseBody(chunks), {
        status: 200,
        headers: {
          'content-type': 'application/vnd.amazon.eventstream',
        },
      }),
  });
  const model = provider('amazon.nova-lite-v1:0');
  const parts: StreamPart[] = [];

  try {
    const { stream } = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      includeRawChunks: false,
    });
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value as StreamPart);
    }

    return { parts };
  } catch (error) {
    return { parts, error };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function textFrom(parts: StreamPart[]): string {
  return parts
    .filter(part => part.type === 'text-delta')
    .map(part => part.delta ?? '')
    .join('');
}

function finishFrom(parts: StreamPart[]): StreamPart | undefined {
  return parts.find(part => part.type === 'finish');
}

async function main() {
  const contentFrames = [
    encodeEvent('messageStart', { role: 'assistant' }),
    encodeEvent('contentBlockStart', {
      contentBlockIndex: 0,
      start: {},
    }),
    encodeEvent('contentBlockDelta', {
      contentBlockIndex: 0,
      delta: { text: 'Hello' },
    }),
    encodeEvent('contentBlockStop', { contentBlockIndex: 0 }),
  ];
  const messageStopFrame = encodeEvent('messageStop', {
    stopReason: 'end_turn',
  });
  const metadataFrame = encodeEvent('metadata', {
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    },
  });

  const valid = await runScenario(
    fragment(concatenate([...contentFrames, messageStopFrame, metadataFrame])),
  );
  assert(valid.error == null, 'Valid fragmented frames unexpectedly rejected');
  assert(
    textFrom(valid.parts) === 'Hello',
    'Valid fragmented frames did not preserve the text result',
  );
  const validFinish = finishFrom(valid.parts);
  assert(
    validFinish?.finishReason?.unified === 'stop' &&
      validFinish.finishReason.raw === 'end_turn' &&
      validFinish.usage?.inputTokens?.total === 1 &&
      validFinish.usage?.outputTokens?.total === 1,
    'Valid fragmented frames did not produce the expected terminal result',
  );

  const cleanBoundary = await runScenario(fragment(concatenate(contentFrames)));
  assert(
    cleanBoundary.error == null,
    'Clean frame-boundary EOF without messageStop unexpectedly rejected',
  );
  assert(
    textFrom(cleanBoundary.parts) === 'Hello' &&
      finishFrom(cleanBoundary.parts)?.finishReason?.unified === 'other',
    'Clean frame-boundary EOF did not retain its separate normal-close behavior',
  );

  const truncatedMessageStop = messageStopFrame.slice(0, -1);
  const truncated = await runScenario(
    fragment(concatenate([...contentFrames, truncatedMessageStop])),
  );

  if (truncated.error != null) {
    const errorMessage =
      truncated.error instanceof Error
        ? truncated.error.message
        : String(truncated.error);
    assert(
      /incomplete.*frame|frame.*incomplete/i.test(errorMessage),
      `Truncated frame rejected without a descriptive incomplete-frame error: ${errorMessage}`,
    );
    return;
  }

  const truncatedFinish = finishFrom(truncated.parts);
  console.error(
    JSON.stringify({
      truncatedFrameBytes: truncatedMessageStop.length,
      text: textFrom(truncated.parts),
      finishReason: truncatedFinish?.finishReason,
      usage: truncatedFinish?.usage,
    }),
  );
  throw new Error(
    'BUG: truncated Bedrock event-stream frame closed normally instead of rejecting',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
